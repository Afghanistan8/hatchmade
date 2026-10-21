// scripts/check.mjs
//
// The local gate that stands in for CI: everything a push used to run on
// GitHub Actions, in one command. The repository deliberately carries no
// Actions workflow (the account cannot start runners).
//
//   node scripts/check.mjs
//
// Runs, in order:
//   1. python -m pytest tests -q        contract suite (59 tests, Direct Mode)
//   2. web: npx tsc --noEmit            console typecheck
//   3. web: npm run lint                console lint
//   4. web: npm run build               console production build
//
// Exits non-zero at the first failing stage.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "web");
const run = (what, cmd, args, cwd, opts) => {
  console.log(`\n=== ${what} ===`);
  const r = spawnSync(cmd, args, { ...opts, cwd });
  if (r.status !== 0) {
    console.error(`\n[CHECK] ${what} FAILED ${r.status !== null ? `(exit ${r.status})` : "(could not start)"}`);
    process.exit(1);
  }
};

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const names = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  // Windows App Execution Aliases may put a non-runnable `python.exe`
  // before the real installation on PATH. Probe every `where` result so the
  // one-command gate works on a normal Windows developer machine as promised.
  if (process.platform === "win32") {
    const found = spawnSync("where.exe", ["python"], { encoding: "utf8" });
    names.push(...String(found.stdout || "").split(/\r?\n/).filter(Boolean));
  }
  for (const candidate of names) {
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return names[0];
}

const py = resolvePython();
const nodeDir = path.dirname(process.execPath);
const npmDir = path.join(nodeDir, "node_modules", "npm", "bin");
const npxCli = path.join(npmDir, "npx-cli.js");
const npmCli = path.join(npmDir, "npm-cli.js");
const haveCliJs = existsSync(npxCli) && existsSync(npmCli);
const plain = { encoding: "utf8", stdio: "inherit" };
const shellOpts = { encoding: "utf8", stdio: "inherit", shell: true };

if (haveCliJs) {
  // The .cmd shims need a shell to start; run npm's entry scripts directly.
  run("contract tests", py, ["-m", "pytest", "tests", "-q"], ROOT, plain);
  run("console typecheck", process.execPath, [npxCli, "tsc", "--noEmit"], WEB, plain);
  run("console lint", process.execPath, [npmCli, "run", "lint"], WEB, plain);
  run("console build", process.execPath, [npmCli, "run", "build"], WEB, plain);
} else {
  // Fallback: through the shell (npm.cmd/npx on PATH).
  run("contract tests", py, ["-m", "pytest", "tests", "-q"], ROOT, shellOpts);
  run("console typecheck", "npx", ["tsc", "--noEmit"], WEB, shellOpts);
  run("console lint", "npm", ["run", "lint"], WEB, shellOpts);
  run("console build", "npm", ["run", "build"], WEB, shellOpts);
}

console.log("\n[CHECK] all green");
