// scripts/verify.mjs
//
// Reads a deployed Hatchmade contract back from Studionet and recomputes,
// in this script, the three things the protocol hangs on:
//
//   packet digest      sha256 over the canon json of the source rows
//                      [[source_id, url, kind, host, pinned_sha256, len], ...]
//                      as frozen at seal (sorted keys, no whitespace)
//   decision digest    sha256 over the canon json of the sorted decision rows
//                      [[source_id, fetch_ok, digest_match, effective], ...]
//                      of every finalised assessment
//   body hashes        every pinned body hashes to its pin
//
// Reads only — the genlayer-js client needs no account for reads, the
// scripts never hold keys, and nothing here writes to the chain.
//
//   node scripts/verify.mjs
//
// Guards: refuses any RPC whose chain id is not 61999.

import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RPC = process.env.HATCHMADE_RPC || "https://studio.genlayer.com/api";
const CHAIN_ID = 61999;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "scripts", "out");
const MANIFEST = path.join(OUT_DIR, "deployment.json");

let CONTRACT = (process.env.HATCHMADE_CONTRACT || "").trim();
if (!CONTRACT && existsSync(MANIFEST)) {
  try {
    CONTRACT = JSON.parse(readFileSync(MANIFEST, "utf8")).contract_address || "";
  } catch { /* env decides */ }
}

function sha256(text) {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function canonSorted(value) {
  // mirror of the contract's _canon: json.dumps(sort_keys=True, separators (",", ":"))
  if (Array.isArray(value)) return "[" + value.map(canonSorted).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => `"${k}":${canonSorted(value[k])}`).join(",") + "}";
  }
  return JSON.stringify(value);
}

function unmap(value) {
  // The SDK sometimes surfaces Map objects; make everything plain shapes.
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([k, v]) => [k, unmap(v)]));
  }
  if (Array.isArray(value)) return value.map(unmap);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unmap(v)]));
  }
  return value;
}

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`rpc ${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function main() {
  if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT)) {
    console.error("set HATCHMADE_CONTRACT=0x... (falls back to scripts/out/deployment.json)");
    process.exit(1);
  }
  const chainHex = await rpc("eth_chainId");
  if (parseInt(chainHex, 16) !== CHAIN_ID) {
    console.error(`[ABORT] chain ${parseInt(chainHex, 16)} is not studionet`);
    process.exit(10);
  }
  console.log(`[chain] ${RPC} -> ${CHAIN_ID} ok; contract ${CONTRACT}`);

  // All reads are batched through one HTTP POST per wave (the gateway
  // rate-limits per request, not per call; a batch of N gen_calls consumes
  // one slot of the anonymous 30/min bucket). An optional Studio API key —
  // env HATCHMADE_STUDIO_API_KEY — is sent as X-API-Key for the
  // authenticated limit, exactly as the Studio app itself sends it.
  const { installRpcBatchFetch } = await import("./lib/rpc-batch.mjs");
  installRpcBatchFetch(RPC, {
    apiKey: process.env.HATCHMADE_STUDIO_API_KEY || "",
    verbose: !!process.env.HATCHMADE_RPC_VERBOSE,
  });

  // Reads go through genlayer-js (the same pipeline the web console uses):
  // no key material, and no CLI text formatting to un-mangle.
  const require = createRequire(path.join(ROOT, "web", "package.json"));
  const gen = require("genlayer-js");
  const client = gen.createClient({ chain: gen.chains.studionet });
  const call = async (method, args = []) =>
    unmap(await client.readContract({ address: CONTRACT, functionName: method, args }));

  let failures = 0;

  const info = await call("get_protocol_info");
  console.log(`[protocol] rules ${info.rules} schema ${info.schema} cases ${info.counts.case}`);
  if (info.rules !== "hatchmade-gate-1") { failures += 1; console.error("[FAIL] rules mismatch"); }

  // Wave 1: protocol info and the case list share one batched POST.
  const cases = await call("list_cases", [0, 100]);

  // Wave 2: every case's packet, assessment sheets and gate fly
  // concurrently, so each case is one batched POST.
  const perCase = await Promise.all((cases.items || []).map(async (caseRow) => {
    const cid = caseRow.case_id;
    const out = [`--- case ${cid} (${caseRow.product} / ${caseRow.lot}) ---`];
    const [packet, sheets, gate] = await Promise.all([
      call("get_packet", [cid]),
      call("list_case_assessments", [cid, 0, 100]),
      call("get_gate", [cid]),
    ]);

    // 1. packet digest, rebuilt from the public fields alone. An open
    //    case froze nothing, so there is no stored digest to recompute.
    const rows = (packet.sources || [])
      .filter((s) => !s.unpinned)
      .map((s) => [
        s.source_id, s.url, s.kind, s.host, s.pinned_sha256, Number(s.byte_len),
      ]);
    if (packet.sealed) {
      const packet_digest = sha256(canonSorted(rows));
      const packet_ok = packet_digest === packet.packet_sha256;
      out.push(`[packet] ${packet_ok ? "OK " : "MISMATCH"} ${packet_digest}`);
      if (!packet_ok) failures += 1;
    } else {
      out.push("[packet] not sealed — no frozen digest to recompute");
    }

    // 2. decision digest of every finalised assessment
    for (const sheetRow of sheets.items || []) {
      if (sheetRow.status !== "FINALIZED") {
        out.push(`[sheet] ${sheetRow.assessment_id}: still ${sheetRow.status}`);
        continue;
      }
      const decision_rows = [...(sheetRow.decisions || [])]
        .map((d) => [
          d.source_id, Number(d.fetch_ok), Number(d.http_status),
          Number(d.live_len), Number(d.digest_match), d.effective,
          d.reader_floor,
        ])
        .sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const decision_digest = sha256(canonSorted(decision_rows));
      const ok = decision_digest === sheetRow.decision_digest;
      out.push(`[sheet ${sheetRow.assessment_id}] outcome ${sheetRow.outcome} ` +
        `digest ${ok ? "OK " : "MISMATCH"} ${decision_digest} ` +
        `floors ${(sheetRow.floors || []).length}`);
      if (!ok) failures += 1;
    }

    // 3. every pinned body must hash to its pin (needs get_source_body),
    //    issued concurrently so the whole wave is one POST.
    const bodyOut = await Promise.all((packet.sources || []).map(async (row) => {
      let body;
      try {
        body = await call("get_source_body", [row.source_id]);
      } catch (e) {
        return { fail: true, text: `[FAIL] ${row.source_id} body read refused: ${String(e).slice(0, 120)}` };
      }
      const body_sha = sha256(body.content || "");
      if (body_sha === row.pinned_sha256) return null;
      return { fail: true, text: `[FAIL] body hash of ${row.source_id} does not recompute` };
    }));
    for (const b of bodyOut) if (b) { failures += 1; out.push(b.text); }

    // 4. the gate line itself
    out.push(`[gate] ${gate.gate} (outcome ${gate.settled_outcome})`);
    return out;
  }));

  for (const lines of perCase) console.log("\n" + lines.join("\n"));

  console.log(failures === 0
    ? "\n[VERIFY] all packet digests, decision digests and body hashes recompute: PASS"
    : `\n[VERIFY] FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 12);
}

main().catch((e) => {
  console.error("[HATCHMADE-VERIFY] " + (e && e.stack || e));
  process.exit(1);
});
