// scripts/live.mjs
//
// Runs the full Hatchmade scenario on Studionet, every write signed by the
// genlayer CLI's unlocked accounts (no key ever enters this repo):
//
//   deployer (0x4184bc...)     binds the authorities, opens+freezes the cases
//   hatchmade-exec             triggers the assessments (anyone may)
//   hatchmade-reviewer         accepts the appointment, releases the gate
//
// Two cases, against the fixtures this repo serves over three CDNs:
//   case 1  regulator bulletin covers LOT-9751       -> expects QUARANTINE
//   case 2  regulator bulletin excludes LOT-9751     -> expects CLEAR, then
//           reviewer appointment and gate release
//
// Every write is confirmed to FINALIZED; any refusal aborts with the
// contract's own bracketed error in view.
//
//   node scripts/live.mjs
//
// Guards: refuses any RPC whose chain id is not 61999.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RPC = process.env.HATCHMADE_RPC || "https://studio.genlayer.com/api";
const CHAIN_ID = 61999;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "scripts", "out");

let CONTRACT = (process.env.HATCHMADE_CONTRACT || "").trim();
if (!CONTRACT && existsSync(path.join(OUT_DIR, "deployment.json"))) {
  try {
    CONTRACT = JSON.parse(readFileSync(path.join(OUT_DIR, "deployment.json"), "utf8")).contract_address || "";
  } catch { /* env decides */ }
}

const FIX_BASE_RAW = "https://raw.githubusercontent.com/Afghanistan8/hatchmade/main/fixtures";
const FIX_BASE_JSD = "https://cdn.jsdelivr.net/gh/Afghanistan8/hatchmade@main/fixtures";
const FIX_BASE_STAT = "https://cdn.statically.io/gh/Afghanistan8/hatchmade/main/fixtures";

const HOSTS = {
  regulator: "raw.githubusercontent.com",
  manufacturer: "cdn.jsdelivr.net",
  logistics: "cdn.statically.io",
};

const FIXTURES = {
  recall: { url: `${FIX_BASE_RAW}/regulator-bulletin-recall-lot9751.txt` },
  clear: { url: `${FIX_BASE_JSD}/regulator-bulletin-clear-lot9751.txt` },
  notice: { url: `${FIX_BASE_JSD}/manufacturer-notice.txt` },
  manifest: { url: `${FIX_BASE_STAT}/outbound-manifest-lot9751.txt` },
};

const wait_defaults = { interval: 5000, retries: 180 };

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

function cli(args, opts = {}) {
  const r = spawnSync("genlayer", args, { encoding: "utf8", shell: true, ...opts });
  return { code: r.status, out: (r.stdout || "") + "", err: (r.stderr || "") + "" };
}

function jsLiteralToJson(text) {
  // The CLI prints JS object literals: bare keys, single-quoted values.
  const candidates = [...text.matchAll(/\{[\s\S]*\}/g)].map((m) => m[0]);
  for (const candidate of candidates) {
    const normalized = candidate
      .replace(/'([^']*)'/g, '"$1"')
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
    try { return JSON.parse(normalized); } catch { /* keep looking */ }
  }
  return null;
}

function parseJsonLoose(text) {
  const candidates = [...text.matchAll(/\{[\s\S]*\}/g)].map((m) => m[0]);
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { /* keep looking */ }
  }
  // Then try the JS-literal normalization above.
  return jsLiteralToJson(text);
}

const steps = [];

function record(step, value) {
  steps.push({ step, ...value });
  console.log(`[step] ${step} -> ${JSON.stringify(value)}`);
}

function fail(step, message) {
  console.error(`[ABORT] ${step}: ${message}`);
  process.exit(20);
}

function findAddress(text) {
  return (text.match(/0x[0-9a-fA-F]{40}/) || [])[0];
}

function useAccount(name, restore) {
  const r = cli(["account", "use", name]);
  if (r.code !== 0) fail("useAccount", `could not switch to ${name}: ${r.out}${r.err}`);
  console.log(`[role] active account: ${name}`);
  if (restore) restore.push(name);
}

function writeTx(contract, method, args) {
  const sendArgs = ["write", contract, method];
  if (args && args.length > 0) {
    // empty --args confuses the CLI: it must be omitted, not emptied
    sendArgs.push("--args", ...(args || []).map((a) => `"${String(a).replace(/"/g, "")}"`));
  }
  sendArgs.push("--rpc", RPC);
  const send = cli(sendArgs);
  if (send.code !== 0) fail(method, `write failed: ${send.out}${send.err}`);
  const receipt = parseJsonLoose(send.out + "\n" + send.err) || {};
  const tx =
    receipt.tx_id || receipt.hash || receipt.txId ||
    (send.out + send.err).match(/0x[0-9a-f]{64}/i)?.[0];
  if (!tx) fail(method, `no tx id in output: ${send.out.slice(0, 800)}${send.err.slice(0, 800)}`);
  const waited = cli(["receipt", tx, "--status", "FINALIZED",
    "--interval", String(wait_defaults.interval),
    "--retries", String(wait_defaults.retries),
    "--rpc", RPC]);
  const waitReceipt = parseJsonLoose(waited.out + "\n" + waited.err) || {};
  // Failure detection runs over BOTH the receipt JSON and the raw CLI text
  // (the CLI prints JS literals, so error markers come in single quotes).
  const blob = (JSON.stringify(waitReceipt) + waited.out + waited.err)
    .replace(/'/g, '"');
  if (/CANCELED|UNDETERMINED/i.test(blob) && !/FINALIZED/.test(blob)) {
    fail(method, `tx ${tx} did not settle: ${blob.slice(0, 400)}`);
  }
  if (/"execution_result":\s*"ERROR"/i.test(blob)) {
    const refusal = blob.match(/\[(?:[A-Z_]+)\][^"\\]{0,160}/);
    fail(method,
      `tx ${tx} was refused by the contract${refusal ? `: ${refusal[0]}` : " (execution error)"}`);
  }
  record(method, { tx });
  return { tx, blob, receipt: waitReceipt };
}

function readCall(contract, method, args) {
  const callArgs = ["call", contract, method];
  if (args && args.length > 0) {
    callArgs.push("--args", ...(args || []).map((a) => `"${String(a).replace(/"/g, "")}"`));
  }
  callArgs.push("--rpc", RPC);
  const r = cli(callArgs);
  if (r.code !== 0) fail(method, `call failed: ${r.out}${r.err}`);
  const parsed = parseJsonLoose(r.out);
  if (!parsed) {
    console.error(`[WARN] ${method} output not JSON; raw: ${r.out.slice(0, 400)}`);
    return { raw: r.out.trim() };
  }
  return parsed;
}

async function main() {
  if (!CONTRACT || !/^0x[0-9a-fA-F]{40}$/.test(CONTRACT)) {
    fail("contract", "set HATCHMADE_CONTRACT=0x... (see scripts/out/deployment.json)");
  }
  const chainHex = await rpc("eth_chainId");
  if (parseInt(chainHex, 16) !== CHAIN_ID) {
    fail("chain", `chain ${parseInt(chainHex, 16)} is not studionet (${CHAIN_ID})`);
  }
  console.log(`[chain] ${RPC} -> ${CHAIN_ID} ok; contract ${CONTRACT}`);

  // -- the accounts -----------------------------------------------------------
  const listed = cli(["account", "list"]).out;
  const execAddr = findAddress(listed.split("\n").find((l) => /hatchmade-exec/.test(l)) || "");
  const reviewerAddr = findAddress(listed.split("\n").find((l) => /hatchmade-reviewer/.test(l)) || "");
  if (!execAddr || !reviewerAddr) {
    fail("accounts", "hatchmade-exec / hatchmade-reviewer missing; run scripts/bootstrap-accounts.mjs first");
  }
  console.log(`[roles] deployer opens/binds; exec ${execAddr}; reviewer ${reviewerAddr}`);

  // -- fixtures must be reachable, and we pin exactly what they serve ---------
  for (const fix of Object.values(FIXTURES)) {
    const res = await fetch(fix.url);
    if (!res.ok) fail("fixtures", `${fix.url} -> HTTP ${res.status}`);
    fix.body = await res.text();
    fix.sha = sha256(fix.body);
    if (fix.body.length > 30000) fail("fixtures", `${fix.url} too large for a pinned body`);
  }
  console.log("[fixtures] all reachable; digests:", {
    recall: FIXTURES.recall.sha, clear: FIXTURES.clear.sha,
    notice: FIXTURES.notice.sha, manifest: FIXTURES.manifest.sha,
  });

  let original = null;
  try {
    original = (cli(["account", "list"]).out.match(/^\*\s*([\w-]+)/) || [])[1];

    const counts = () => readCall(CONTRACT, "get_protocol_info").counts;

    const runCase = (name, product, lot, bulletinKey) => {
      const before = counts().case;
      writeTx(CONTRACT, "open_case", [product, lot]);
      const after = counts().case;
      if (after !== before + 1) fail(name, `case counter did not advance (${before} -> ${after})`);
      const cid = `C${after}`;
      record(name, { case_id: cid, product, lot, bulletin: bulletinKey });
      return cid;
    };

    const pinAndSeal = (cid, bulletinKey) => {
      writeTx(CONTRACT, "pin_source", [cid, FIXTURES[bulletinKey].url, FIXTURES[bulletinKey].body]);
      writeTx(CONTRACT, "pin_source", [cid, FIXTURES.notice.url, FIXTURES.notice.body]);
      writeTx(CONTRACT, "pin_source", [cid, FIXTURES.manifest.url, FIXTURES.manifest.body]);
      writeTx(CONTRACT, "seal_packet", [cid]);
      const packet = readCall(CONTRACT, "get_packet", [cid]);
      record("seal_packet", { case_id: cid, packet_sha256: packet.packet_sha256 || null });
    };

    const requestRun = (cid) => {
      const before = counts().assessment;
      writeTx(CONTRACT, "request_assessment", [cid]);
      const after = counts().assessment;
      if (after !== before + 1) fail("request_assessment", `counter did not advance (${before} -> ${after})`);
      const aid = `A${after}`;
      record("request_assessment", { case_id: cid, assessment_id: aid });
      return aid;
    };

    useAccount("deployer");

    // -- bind the three authority kinds to distinct hosts (deployer) -----------
    // (if a previous run bound some hosts already, skip those: rerun-friendly)
    const binds = [
      [HOSTS.regulator, "REGULATOR", "regency service bulletins (fixture mirror)"],
      [HOSTS.manufacturer, "MANUFACTURER", "meridian consumer notices (fixture mirror)"],
      [HOSTS.logistics, "LOGISTICS", "meridian outbound manifests (fixture mirror)"],
    ];
    for (const [host, kind, note] of binds) {
      const state = readCall(CONTRACT, "authority_bound", [host]);
      if (state.bound === true) {
        record("register_authority", { host, kind, skipped: `already bound as ${state.kind}` });
        if (state.kind !== kind) fail("register_authority", `${host} is bound as ${state.kind}, not ${kind}`);
        continue;
      }
      writeTx(CONTRACT, "register_authority", [host, kind, note]);
    }

    // -- case 1: the recall bulletin covers LOT-9751 ----------------------------
    const cid1 = runCase("OPEN_QUARANTINE_CASE", "Aero-Puck AP-1150", "LOT-9751", "recall");
    pinAndSeal(cid1, "recall");
    const a1 = requestRun(cid1);

    useAccount("hatchmade-exec");
    writeTx(CONTRACT, "execute_assessment", [a1]);
    const gate1 = readCall(CONTRACT, "get_gate", [cid1]);
    if (gate1.gate !== "BLOCKED") fail("case1", `gate is ${gate1.gate}, expected BLOCKED`);
    if (gate1.settled_outcome !== "QUARANTINE") {
      console.error(`[WARN] case 1 settled ${gate1.settled_outcome} (the live reader judged the live bulletin; report records the truth)`);
    }
    record("CASE1_OUTCOME", { case_id: cid1, settled_outcome: gate1.settled_outcome, gate: gate1.gate });

    // -- case 2: the bulletin that excludes this lot, released by the reviewer ---
    useAccount("deployer");
    const cid2 = runCase("OPEN_CLEAR_CASE", "Aero-Puck AP-1150", "LOT-9751", "clear");
    pinAndSeal(cid2, "clear");
    const a2 = requestRun(cid2);

    useAccount("hatchmade-exec");
    writeTx(CONTRACT, "execute_assessment", [a2]);
    const gate2 = readCall(CONTRACT, "get_gate", [cid2]);
    record("CASE2_OUTCOME", { case_id: cid2, settled_outcome: gate2.settled_outcome, gate: gate2.gate });
    if (gate2.settled_outcome !== "CLEAR") {
      console.error("[WARN] case 2 did not settle CLEAR -> the reviewer path will refuse; report records the truth");
    }

    useAccount("deployer");
    writeTx(CONTRACT, "propose_reviewer", [cid2, reviewerAddr]);
    useAccount("hatchmade-reviewer");
    writeTx(CONTRACT, "accept_reviewer", [cid2]);
    writeTx(CONTRACT, "release_gate",
      [cid2, "Independent review: bulletin 2026-81 scope does not cover LOT-9751."]);
    const gate3 = readCall(CONTRACT, "get_gate", [cid2]);
    if (gate3.gate !== "RELEASED") fail("case2", `gate is ${gate3.gate}, expected RELEASED`);
    record("GATE_RELEASED", { case_id: cid2, released_at: gate3.released_at });

    // -- the quarantined case must still be shut ---------------------------------
    const blockStill = readCall(CONTRACT, "get_gate", [cid1]);
    record("CASE1_STILL_BLOCKED", { case_id: cid1, gate: blockStill.gate });

    if (original) useAccount(original);
  } finally {
    // account switching already restored inside main(); nothing to hold here
  }

  // -- the reports --------------------------------------------------------------
  const summary = {
    protocol: "hatchmade",
    network: RPC,
    contract: CONTRACT,
    at: new Date().toISOString(),
    fixtures: Object.fromEntries(
      Object.entries(FIXTURES).map(([k, v]) => [k, { url: v.url, sha256: v.sha }])),
    steps,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `live-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
  console.log("--- live report ---");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`[done] report -> ${out}`);
}

main().catch((e) => {
  console.error("[HATCHMADE-LIVE] " + (e && e.stack || e));
  process.exit(1);
});
