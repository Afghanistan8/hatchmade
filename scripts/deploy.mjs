// scripts/deploy.mjs
//
// Deploys contracts/hatchmade.py to Studionet with the unlocked deployer
// the genlayer CLI holds, and writes a deployment manifest with the source
// digest so the deployed artifact can be checked byte for byte.
//
//   node scripts/deploy.mjs
//
// Guards: refuses any RPC whose chain id is not 61999 (studionet).

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RPC = process.env.HATCHMADE_RPC || "https://studio.genlayer.com/api";
const CHAIN_ID = 61999;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = path.join(ROOT, "contracts", "hatchmade.py");
const OUT_DIR = path.join(ROOT, "scripts", "out");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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
  const r = spawnSync("genlayer", args, {
    encoding: "utf8",
    shell: true,
    ...opts,
  });
  return { code: r.status, out: (r.stdout || "") + "", err: (r.stderr || "") + "" };
}

function parseJsonLoose(text) {
  const start = text.search(/\{/);
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    const alt = text.indexOf("{", start + 1);
    if (alt >= 0) {
      try { return JSON.parse(text.slice(alt)); } catch { /* fall through */ }
    }
    return null;
  }
}

// The CLI prints JS-style objects (single quotes), so structure is read by
// targeted extraction and every address is proven with a real view call.
function extractContractAddress(text) {
  const direct =
    text.match(/contract_address['"]?\s*[:=]\s*'?(0x[0-9a-fA-F]{40})'?/) ||
    text.match(/to_address['"]?\s*[:=]\s*'?(0x[0-9a-fA-F]{40})'?/);
  return direct ? direct[1] : null;
}

async function main() {
  // -- chain guard: only studionet ever gets this code ----------------------
  const chainHex = await rpc("eth_chainId");
  const chainId = parseInt(chainHex, 16);
  if (chainId !== CHAIN_ID) {
    console.error(`[HATCHMADE-DEPLOY] refusing chain ${chainId}: this code deploys to ${CHAIN_ID} (studionet) only`);
    process.exit(10);
  }
  console.log(`[chain] ${RPC} -> ${chainId} (studionet) ok`);

  // -- source digest: what we deploy must be what we later ship --------------
  const source = readFileSync(CONTRACT, "utf8");
  const pin = source.split("\n")[0].trim();
  if (!pin.startsWith('# { "Depends": "py-genlayer:')) {
    console.error("[HATCHMADE-DEPLOY] contract is missing its runner pin");
    process.exit(11);
  }
  if (/latest|test/.test(pin)) {
    console.error("[HATCHMADE-DEPLOY] refusing an alias runner pin: " + pin);
    process.exit(12);
  }
  const source_sha256 = sha256(Buffer.from(source, "utf8"));
  console.log(`[source] ${path.relative(ROOT, CONTRACT)} sha256 ${source_sha256}`);
  console.log(`[runner] ${pin.match(/py-genlayer:[a-z0-9]+/)[0]}`);

  // -- deploy with the unlocked deployer (the CLI account) --------------------
  const whoami = cli(["account", "list"]);
  const active = /deployer.*\(active\)/.test(whoami.out);
  if (!active) {
    console.error("[HATCHMADE-DEPLOY] no active unlocked deployer account");
    process.exit(13);
  }
  console.log("[account] deployer (unlocked, CLI keychain)");

  const deployed = cli(["deploy", "--contract", CONTRACT, "--rpc", RPC]);
  if (deployed.code !== 0) {
    console.error("[HATCHMADE-DEPLOY] deploy failed:\n" + deployed.out + deployed.err);
    process.exit(14);
  }
  const receipt = parseJsonLoose(deployed.out) || parseJsonLoose(deployed.err);
  const tx_id =
    (receipt && (receipt.tx_id || receipt.hash || receipt.txId)) ||
    (deployed.out.match(/0x[0-9a-f]{64}/i) || [])[0];
  if (!tx_id) {
    console.error("[HATCHMADE-DEPLOY] could not find the deploy tx id:\n" + deployed.out + deployed.err);
    process.exit(15);
  }
  console.log(`[deploy] tx ${tx_id} (waiting for FINALIZED; consortium timing is minutes)`);

  const waited = cli([
    "receipt", tx_id, "--status", "FINALIZED", "--interval", "5000",
    "--retries", "160", "--rpc", RPC,
  ]);
  const waitReceipt = parseJsonLoose(waited.out) || parseJsonLoose(waited.err);
  if (waited.code !== 0 && !waitReceipt) {
    console.error("[HATCHMADE-DEPLOY] receipt wait failed:\n" + waited.out + waited.err);
    process.exit(16);
  }

  // -- locate the contract address --------------------------------------------
  const fullBlob = deployed.out + "\n" + deployed.err + "\n" + waited.out + "\n" + waited.err;
  let address = extractContractAddress(JSON.stringify(waitReceipt || {}) + fullBlob);
  if (!address) {
    console.error("[HATCHMADE-DEPLOY] could not find the contract address in the receipt:\n" + waited.out.slice(0, 2000));
    process.exit(17);
  }
  address = address.toLowerCase();
  console.log(`[deploy] contract ${address}`);

  // -- prove it: the deployed gate must answer the protocol view ---------------
  const proof = cli(["call", address, "get_protocol_info", "--rpc", RPC]);
  if (proof.code !== 0 || !/hatchmade-gate-1/.test(proof.out)) {
    console.error("[HATCHMADE-DEPLOY] the contract address does not answer " +
      "get_protocol_info with these rules; refusing to write a manifest.\n" +
      proof.out.slice(0, 800) + proof.err.slice(0, 200));
    process.exit(18);
  }
  console.log("[deploy] get_protocol_info answered with hatchmade-gate-1");
  const code = cli(["code", address, "--rpc", RPC]);
  const deployed_code = code.out;
  const deployed_sha256 = sha256(Buffer.from(deployed_code, "utf8"));

  const manifest = {
    protocol: "hatchmade",
    network: RPC,
    chain_id: chainId,
    runner_pin: pin.match(/py-genlayer:[a-z0-9]+/)[0],
    contract_address: address,
    deploy_tx: tx_id,
    deployed_at: new Date().toISOString(),
    source_sha256,
    deployed_code_sha256: deployed_sha256,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `deployment-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");

  console.log("--- deployment manifest ---");
  console.log(JSON.stringify(manifest, null, 2));
  console.log(`[done] manifest -> ${out}`);
  console.log(`[NOTE] set NEXT_PUBLIC_HATCHMADE_CONTRACT=${address} for the console.`);
}

main().catch((e) => {
  console.error("[HATCHMADE-DEPLOY] " + (e && e.stack || e));
  process.exit(1);
});
