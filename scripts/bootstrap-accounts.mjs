// scripts/bootstrap-accounts.mjs
//
// Prepares the extra wallets the live scenario needs, using the genlayer CLI
// (no key ever leaves the CLI keystore / OS keychain):
//
//   hatchmade-exec      -- triggers the assessment (anyone may)
//   hatchmade-reviewer  -- the independent reviewer (accepts + releases)
//
// Both are created with a generated password (stored in .env, which is
// gitignored), unlocked into the OS keychain, and funded from deployer.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RPC = process.env.HATCHMADE_RPC || "https://studio.genlayer.com/api";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, ".env");

function cli(args) {
  const r = spawnSync("genlayer", args, { encoding: "utf8", shell: true });
  return { code: r.status, out: (r.stdout || "") + "", err: (r.stderr || "") + "" };
}

function envValue(name) {
  if (!existsSync(ENV_FILE)) return undefined;
  const line = readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .find((l) => l.startsWith(name + "="));
  return line ? line.slice(name.length + 1).trim() : undefined;
}

function listAccounts() {
  const r = cli(["account", "list"]);
  const rows = {};
  for (const line of r.out.split("\n")) {
    const m = line.match(/^\*?\s*([\w-]+)\s+(0x[0-9a-fA-F]{40})/);
    if (m) rows[m[1]] = { address: m[2].toLowerCase(), unlocked: line.includes("(unlocked)") };
  }
  return rows;
}

function main() {
  const accounts = listAccounts();
  const made = {};

  for (const name of ["hatchmade-exec", "hatchmade-reviewer"]) {
    if (accounts[name]) {
      console.log(`[account] ${name} exists (${accounts[name].address})`);
      made[name] = accounts[name].address;
      continue;
    }
    const pw = process.env.HATCHMADE_BOOTSTRAP_PASSWORD || randomBytes(18).toString("base64url");
    let r = cli(["account", "create", "--name", name, "--password", pw, "--no-set-active"]);
    if (r.code !== 0 && !/exists/i.test(r.out + r.err)) {
      console.error(`[account] create ${name} failed: ${r.out}${r.err}`);
      process.exit(20);
    }
    r = cli(["account", "unlock", "--account", name, "--password", pw]);
    if (r.code !== 0) {
      console.error(`[account] unlock ${name} failed: ${r.out}${r.err}`);
      process.exit(21);
    }
    const fresh = listAccounts()[name];
    made[name] = fresh?.address;
    // remember the password locally (gitignored) so the account stays usable
    const env = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
    const key = name.toUpperCase().replace(/-/g, "_") + "_PASSWORD";
    if (!env.includes(key + "=")) {
      writeFileSync(ENV_FILE, env + `${key}=${pw}\n`);
    }
    console.log(`[account] created ${name} -> ${made[name]}`);
  }

  // fund both from deployer (1000 GEN each) if balances look thin
  for (const name of Object.keys(made)) {
    const account = cli(["account", "show", "--account", name]);
    const balance = Number((account.out.match(/([\d.]+) GEN/) || [])[1] || 0);
    if (!Number.isFinite(balance) || balance < 10) {
      console.log(`[funding] ${name} (${balance} GEN) <- 1000 GEN from deployer`);
      const r = cli(["account", "send", made[name], "1000", "--account", "deployer", "--rpc", RPC]);
      if (r.code !== 0) console.error("[funding] warning: " + r.out + r.err);
    } else {
      console.log(`[funding] ${name} holds ${balance} GEN; skipping`);
    }
  }

  console.log(JSON.stringify({ rpc: RPC, accounts: made }, null, 2));
}

main();
