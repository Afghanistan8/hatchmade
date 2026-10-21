// scripts/verify.mjs
//
// Reads a deployed Hatchmade contract back from Studionet and recomputes,
// in this script, the two digests the protocol hangs on:
//
//   packet digest      sha256 over the canon json of the source rows
//                      [[source_id, url, kind, host, pinned_sha256, len], ...]
//                      as pinned at seal (sorted keys, no whitespace)
//   decision digest    sha256 over the canon json of the sorted decision rows
//                      [[source_id, fetch_ok, digest_match, effective], ...]
//
// No keys involved: reads only.
//
//   node scripts/verify.mjs
//
// Guards: refuses any RPC whose chain id is not 61999.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RPC = process.env.HATCHMADE_RPC || "https://studio.genlayer.com/api";
const CHAIN_ID = 61999;
const CONTRACT = (process.env.HATCHMADE_CONTRACT || "").trim();

function cli(args) {
  const r = spawnSync("genlayer", args, { encoding: "utf8", shell: true });
  return { code: r.status, out: (r.stdout || "") + "", err: (r.stderr || "") + "" };
}

function parseJsonLoose(text) {
  const candidates = [...text.matchAll(/\{[\s\S]*\}/g)].map((m) => m[0]);
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { /* keep looking */ }
  }
  return null;
}

function sha256(text) {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
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

function canonSorted(value) {
  // mirror of the contract's _canon: json.dumps(sort_keys=True, separators (",", ":"))
  if (Array.isArray(value)) return "[" + value.map(canonSorted).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => `"${k}":${canonSorted(value[k])}`).join(",") + "}";
  }
  return JSON.stringify(value);
}

async function main() {
  if (!/^0x[0-9a-f]{40}$/.test(CONTRACT)) {
    console.error("set HATCHMADE_CONTRACT=0x...");
    process.exit(1);
  }
  const chainHex = await rpc("eth_chainId");
  if (parseInt(chainHex, 16) !== CHAIN_ID) {
    console.error(`[ABORT] chain ${parseInt(chainHex, 16)} is not studionet`);
    process.exit(10);
  }
  console.log(`[chain] ${RPC} -> ${CHAIN_ID} ok; contract ${CONTRACT}`);

  let failures = 0;

  const call = (method, args) => {
    const quoted = (args || []).map((a) => `"${a}"`);
    const r = cli(["call", CONTRACT, method, "--args", ...quoted, "--rpc", RPC]);
    const parsed = parseJsonLoose(r.out);
    if (!parsed) {
      console.error(`[ABORT] ${method} not parseable: ${r.out.slice(0, 300)}${r.err.slice(0, 300)}`);
      process.exit(11);
    }
    return parsed;
  };

  const info = call("get_protocol_info");
  console.log(`[protocol] rules ${info.rules} schema ${info.schema} cases ${info.counts.case}`);
  if (info.rules !== "hatchmade-gate-1") { failures += 1; console.error("[FAIL] rules mismatch"); }

  const cases = call("list_cases", ["0", "100"]);
  for (const caseRow of cases.items || []) {
    const cid = caseRow.case_id;
    console.log(`\n--- case ${cid} (${caseRow.product} / ${caseRow.lot}) ---`);
    const packet = call("get_packet", [cid]);

    // 1. packet digest, rebuilt from the public fields alone
    const rows = (packet.sources || [])
      .filter((s) => !s.unpinned)
      .map((s) => [
        s.source_id, s.url, s.kind, s.host, s.pinned_sha256, Number(s.byte_len),
      ]);
    const packet_digest = sha256(canonSorted(rows));
    const packet_ok = packet_digest === packet.packet_sha256;
    console.log(`[packet] ${packet_ok ? "OK " : "MISMATCH"} ${packet_digest}`);
    if (!packet_ok) failures += 1;

    // 2. decision digest of every finalised assessment
    const sheets = call("list_case_assessments", [cid, "0", "100"]);
    for (const sheetRow of sheets.items || []) {
      if (sheetRow.status !== "FINALIZED") {
        console.log(`[sheet] ${sheetRow.assessment_id}: still ${sheetRow.status}`);
        continue;
      }
      const decision_rows = [...(sheetRow.decisions || [])]
        .map((d) => [d.source_id, Number(d.fetch_ok), Number(d.digest_match), d.effective])
        .sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const decision_digest = sha256(canonSorted(decision_rows));
      const ok = decision_digest === sheetRow.decision_digest;
      console.log(`[sheet ${sheetRow.assessment_id}] outcome ${sheetRow.outcome} ` +
        `digest ${ok ? "OK " : "MISMATCH"} ${decision_digest} ` +
        `floors ${(sheetRow.floors || []).length}`);
      if (!ok) failures += 1;

      // 3. pinned bodies must hash to their pin (needs get_source_body)
      for (const row of packet.sources || []) {
        const body = call("get_source_body", [row.source_id]);
        const body_sha = sha256(body.content || "");
        if (body_sha !== row.pinned_sha256) {
          failures += 1;
          console.error(`[FAIL] body hash of ${row.source_id} does not recompute`);
        }
      }
    }

    // 4. the gate line itself
    const gate = call("get_gate", [cid]);
    console.log(`[gate] ${gate.gate} (outcome ${gate.settled_outcome})`);
  }

  console.log(failures === 0
    ? "\n[VERIFY] all packet digests, decision digests and body hashes recompute: PASS"
    : `\n[VERIFY] FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 12);
}

main().catch((e) => {
  console.error("[HATCHMADE-VERIFY] " + (e && e.stack || e));
  process.exit(1);
});
