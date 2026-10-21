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

// The clear bulletin is a REGULATOR document, so it is served from the
// REGULATOR-bound host — the kind of a pinned source is the kind of its
// host's authority (R-AUT-2), and a packet without a REGULATOR source
// cannot seal (R-FRZ-1).
const FIXTURES = {
  recall: { url: `${FIX_BASE_RAW}/regulator-bulletin-recall-lot9751.txt` },
  clear: { url: `${FIX_BASE_RAW}/regulator-bulletin-clear-lot9751.txt` },
  notice: { url: `${FIX_BASE_JSD}/manufacturer-notice.txt` },
  manifest: { url: `${FIX_BASE_STAT}/outbound-manifest-lot9751.txt` },
};

const wait_defaults = { interval: 5000, retries: 180 };

// The studio RPC occasionally serves an HTML error page or drops a
// connection mid-flight. Those are transport failures, not contract
// refusals, and a send that died before producing a tx id touched
// nothing — so only that exact shape is retried.
const TRANSIENT_RE = /DOCTYPE|Unexpected token|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|socket|Bad Gateway| 50[234]|rate limit|too many requests|Internal Server Error/i;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// The genlayer CLI is a node script; run its entry directly. Going through
// a shell (cmd.exe + npm shims) re-flowed newlines inside string arguments,
// which silently changed pinned bytes so the panel legitimately flagged
// DIGEST_MISMATCH; direct argv transport is byte-faithful.
const GENLAYER_JS = path.join(
  process.env.APPDATA || "", "npm", "node_modules", "genlayer", "dist", "index.js",
);
const WITH_SHELL = !existsSync(GENLAYER_JS);

// Under a shell transport the quotes around a value are consumed by the
// shell; under the direct transport argv reaches the CLI verbatim, so the
// quoting must be dropped or the CLI would parse the quote characters
// into the value itself.
function tok(value) {
  const text = String(value).replace(/"/g, "");
  return WITH_SHELL ? `"${text}"` : text;
}

function cli(args, opts = {}) {
  const argv = WITH_SHELL ? ["genlayer", ...args] : [GENLAYER_JS, ...args];
  const r = spawnSync(
    WITH_SHELL ? "genlayer" : process.execPath, argv,
    { encoding: "utf8", shell: WITH_SHELL, ...opts },
  );
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

// Wraps cli() with retries for transient transport errors. A non-zero
// exit that carries a tx hash is treated as sent (the receipt wait rules
// on it); a non-zero exit with no hash is retried only when it matches
// TRANSIENT_RE, because a genuine contract refusal must abort the run.
async function cliRetry(args, what, { tries = 4, waitMs = 30000, sentMaySucceed = false } = {}) {
  for (let i = 1; i <= tries; i++) {
    const r = cli(args);
    if (r.code === 0) return r;
    const blob = `${r.out}\n${r.err}`;
    if (sentMaySucceed && blob.match(/0x[0-9a-f]{64}/i)) return r;
    if (!TRANSIENT_RE.test(blob) || i === tries) {
      fail(what, `failed: ${r.out.slice(0, 300)}${r.err.slice(0, 800)}`);
    }
    console.log(`[retry] ${what}: transient RPC error, waiting ${waitMs / 1000}s (attempt ${i}/${tries})`);
    await sleep(waitMs);
  }
  fail(what, "retry loop fell through");
}

async function writeTx(contract, method, args) {
  const sendArgs = ["write", contract, method];
  if (args && args.length > 0) {
    // empty --args confuses the CLI: it must be omitted, not emptied
    sendArgs.push("--args", ...(args || []).map(tok));
  }
  sendArgs.push("--rpc", RPC);
  const send = await cliRetry(sendArgs, method, { sentMaySucceed: true });
  const receipt = parseJsonLoose(send.out + "\n" + send.err) || {};
  const tx =
    receipt.tx_id || receipt.hash || receipt.txId ||
    (send.out + send.err).match(/0x[0-9a-f]{64}/i)?.[0];
  if (!tx) fail(method, `no tx id in output: ${send.out.slice(0, 800)}${send.err.slice(0, 800)}`);
  let waited = null;
  let blob = "";
  for (let i = 1; i <= 4; i++) {
    waited = cli(["receipt", tx, "--status", "FINALIZED",
      "--interval", String(wait_defaults.interval),
      "--retries", String(wait_defaults.retries),
      "--rpc", RPC]);
    blob = (JSON.stringify(parseJsonLoose(waited.out + "\n" + waited.err) || {}) +
      waited.out + waited.err);
    if (waited.code === 0 && /FINALIZED/.test(blob)) break;
    if (i < 4) {
      console.log(`[retry] ${method}: receipt wait disturbed, waiting 15s (attempt ${i}/4)`);
      await sleep(15000);
      continue;
    }
    fail(method, `tx ${tx} receipt never reported FINALIZED: ${blob.slice(0, 400)}`);
  }
  const waitReceipt = parseJsonLoose(waited.out + "\n" + waited.err) || {};
  // Failure detection runs over the raw CLI text. A genuine contract
  // refusal carries a rollback with a bracketed payload; validators
  // cancelled after quorum also print `execution_result: ERROR` in
  // perfectly good transactions, so that shape alone proves nothing.
  if (/CANCELED|UNDETERMINED/i.test(blob) && !/FINALIZED/.test(blob)) {
    fail(method, `tx ${tx} did not settle: ${blob.slice(0, 400)}`);
  }
  const refusal = blob.match(/payload\s*:?\s*['"]?\[(?:[A-Z_]{2,})\][^'"]{0,160}/);
  if (refusal || /exit_code 1|AmV4aXRfY29kZSAx/.test(blob)) {
    fail(method,
      `tx ${tx} was refused by the contract${refusal ? `: ${refusal[0]}` : " (execution error)"}`);
  }
  record(method, { tx });
  return { tx, blob, receipt: waitReceipt };
}

async function readCall(contract, method, args) {
  const callArgs = ["call", contract, method];
  if (args && args.length > 0) {
    callArgs.push("--args", ...(args || []).map(tok));
  }
  callArgs.push("--rpc", RPC);
  for (let i = 1; i <= 4; i++) {
    const r = cli(callArgs);
    if (r.code === 0) {
      const parsed = parseJsonLoose(r.out);
      if (!parsed) {
        console.error(`[WARN] ${method} output not JSON; raw: ${r.out.slice(0, 400)}`);
        return { raw: r.out.trim() };
      }
      return parsed;
    }
    if (!TRANSIENT_RE.test(`${r.out}\n${r.err}`) || i === 4) {
      fail(method, `call failed: ${r.out.slice(0, 300)}${r.err.slice(0, 800)}`);
    }
    console.log(`[retry] ${method}: transient RPC error, waiting 15s (attempt ${i}/4)`);
    await sleep(15000);
  }
  fail(method, "read retry loop fell through");
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

    const counts = async () => (await readCall(CONTRACT, "get_protocol_info")).counts;

    // A rerun after a transport failure must not spam fresh cases: an OPEN,
    // unsealed case with the same product/lot whose pins all belong to the
    // same scenario is adopted and completed (pin dedupe by URL).
    const scenarioURLs = (bulletinKey) => [
      FIXTURES[bulletinKey].url, FIXTURES.notice.url, FIXTURES.manifest.url,
    ];
    const sourceURLs = async (sourceIds) => (await Promise.all(
      sourceIds.map((sid) => readCall(CONTRACT, "get_source", [sid])),
    )).map((s) => s.url);
    const adoptCase = async (product, lot, bulletinKey) => {
      const page = await readCall(CONTRACT, "list_cases", [0, 100]);
      const want = scenarioURLs(bulletinKey);
      for (const row of page.items || []) {
        if (row.state !== "OPEN" || row.sealed) continue;
        if (row.product !== product || row.lot !== lot) continue;
        const urls = await sourceURLs(row.source_ids || []);
        if (urls.length === 0 || urls.length >= 3) continue;
        if (!urls.every((u) => want.includes(u))) continue;
        if (!urls.includes(FIXTURES[bulletinKey].url)) continue;
        return row.case_id;
      }
      return null;
    };

    const runCase = async (name, product, lot, bulletinKey) => {
      const adopt = await adoptCase(product, lot, bulletinKey);
      if (adopt) {
        record(name, { case_id: adopt, adopted: true });
        console.log(`[case] adopting incomplete case ${adopt} for scenario ${bulletinKey}`);
        return adopt;
      }
      const before = (await counts()).case;
      await writeTx(CONTRACT, "open_case", [product, lot]);
      const after = (await counts()).case;
      if (after !== before + 1) fail(name, `case counter did not advance (${before} -> ${after})`);
      const cid = `C${after}`;
      record(name, { case_id: cid, product, lot, bulletin: bulletinKey });
      return cid;
    };

    const pinAndSeal = async (cid, bulletinKey) => {
      const have = new Set(await sourceURLs(
        (await readCall(CONTRACT, "get_case", [cid])).source_ids || []));
      for (const [url, body] of [
        [FIXTURES[bulletinKey].url, FIXTURES[bulletinKey].body],
        [FIXTURES.notice.url, FIXTURES.notice.body],
        [FIXTURES.manifest.url, FIXTURES.manifest.body],
      ]) {
        if (have.has(url)) {
          record("pin_source", { case_id: cid, url, skipped: "already pinned" });
          continue;
        }
        await writeTx(CONTRACT, "pin_source", [cid, url, body]);
      }
      await writeTx(CONTRACT, "seal_packet", [cid]);
      const packet = await readCall(CONTRACT, "get_packet", [cid]);
      record("seal_packet", { case_id: cid, packet_sha256: packet.packet_sha256 || null });
    };

    const requestRun = async (cid) => {
      const before = (await counts()).assessment;
      await writeTx(CONTRACT, "request_assessment", [cid]);
      const after = (await counts()).assessment;
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
      const state = await readCall(CONTRACT, "authority_bound", [host]);
      if (state.bound === true) {
        record("register_authority", { host, kind, skipped: `already bound as ${state.kind}` });
        if (state.kind !== kind) fail("register_authority", `${host} is bound as ${state.kind}, not ${kind}`);
        continue;
      }
      await writeTx(CONTRACT, "register_authority", [host, kind, note]);
    }

    // -- case 1: the recall bulletin covers LOT-9751 ----------------------------
    const cid1 = await runCase("OPEN_QUARANTINE_CASE", "Aero-Puck AP-1150", "LOT-9751", "recall");
    await pinAndSeal(cid1, "recall");
    const a1 = await requestRun(cid1);

    useAccount("hatchmade-exec");
    await writeTx(CONTRACT, "execute_assessment", [a1]);
    const gate1 = await readCall(CONTRACT, "get_gate", [cid1]);
    if (gate1.gate !== "BLOCKED") fail("case1", `gate is ${gate1.gate}, expected BLOCKED`);
    if (gate1.settled_outcome !== "QUARANTINE") {
      console.error(`[WARN] case 1 settled ${gate1.settled_outcome} (the live reader judged the live bulletin; report records the truth)`);
    }
    record("CASE1_OUTCOME", { case_id: cid1, settled_outcome: gate1.settled_outcome, gate: gate1.gate });

    // -- case 2: the bulletin that excludes this lot, released by the reviewer ---
    useAccount("deployer");
    const cid2 = await runCase("OPEN_CLEAR_CASE", "Aero-Puck AP-1150", "LOT-9751", "clear");
    await pinAndSeal(cid2, "clear");
    const a2 = await requestRun(cid2);

    useAccount("hatchmade-exec");
    await writeTx(CONTRACT, "execute_assessment", [a2]);
    const gate2 = await readCall(CONTRACT, "get_gate", [cid2]);
    record("CASE2_OUTCOME", { case_id: cid2, settled_outcome: gate2.settled_outcome, gate: gate2.gate });
    if (gate2.settled_outcome !== "CLEAR") {
      console.error("[WARN] case 2 did not settle CLEAR -> the reviewer path will refuse; report records the truth");
    }

    // The reviewer path is rerun-safe: proposal/acceptance already on chain
    // is not repeated, and a released gate is only read.
    useAccount("deployer");
    const row2 = await readCall(CONTRACT, "get_case", [cid2]);
    if (row2.released) {
      console.log(`[case] ${cid2} already released; skipping the reviewer steps`);
    } else {
      if (row2.reviewer_state === "NONE") {
        await writeTx(CONTRACT, "propose_reviewer", [cid2, reviewerAddr]);
        useAccount("hatchmade-reviewer");
        await writeTx(CONTRACT, "accept_reviewer", [cid2]);
      }
      useAccount("hatchmade-reviewer");
      await writeTx(CONTRACT, "release_gate",
        [cid2, "Independent review: bulletin 2026-81 scope does not cover LOT-9751."]);
    }
    const gate3 = await readCall(CONTRACT, "get_gate", [cid2]);
    if (gate3.gate !== "RELEASED") fail("case2", `gate is ${gate3.gate}, expected RELEASED`);
    record("GATE_RELEASED", { case_id: cid2, released_at: gate3.released_at });

    // -- the quarantined case must still be shut ---------------------------------
    const blockStill = await readCall(CONTRACT, "get_gate", [cid1]);
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
