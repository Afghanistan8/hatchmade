# Testing

The suite is hermetic and fast: `python -m pytest tests` runs **59 tests**
in about five seconds, with no network and no models.

## How that is possible

Direct Mode. `tests/helpers.py` imports `contracts/hatchmade.py` and
instantiates `Hatchmade` on a mock vm that replaces the two namespaces the
on-chain code reaches through:

- `vm._web_mocks` — `gl.nondet.web.get` answers from an in-memory map of
  url → (status, bytes); tests splice per-test entries to simulate moved
  live bytes, empty bodies, 404s.
- `vm._llm_mocks` — `gl.nondet.exec_prompt` answers with crafted model
  output, including malformed json, prose-wrapped answers, held answers,
  and confident but ungrounded clearances.

Because the contract file's parts 1–5 are pure functions, the tests call
the *same functions* the on-chain code calls — receipts, floors,
calibration, agreement checking, URL shaping, grounding. The on-chain
entry points are exercised the same way, with the mock vm standing in for
the runner.

## What is covered (roughly, by area)

- **URLs and hosts (R-SRC-1)** — `URL_REJECTS` table drives parametrised
  refusals: fragments, ports, userinfo in the authority section, control
  characters, empty paths; and explicitly *accepts* a `repo@main` version
  marker in the path.
- **Authorities (R-AUT-1, R-AUT-2)** — kinds come from the first binding;
  re-binding is refused; pinning from an unbound host is refused; the
  pinned kind never depends on packer metadata.
- **The packet (R-FRZ-1, R-SRC-2, R-SRC-3)** — pinning over ceilings,
  tombstones after unpin, seal requiring all three authority kinds, one
  packet digest, refusal to seal twice.
- **Assessment (R-ASM-*, R-FLO-1)** — receipts for every fetch shape,
  floors named in order, disagreement writes nothing and the request
  survives, one lead agreed decision stored with its digest.
- **Calibration (R-CAL-1, R-CAL-2)** — every outcome mapping, plus the
  monotonic hardening across later assessments.
- **Judging and grounding (R-JUD-*, R-GRD-1, R-GRD-2)** — malformed model
  answers land as `UNCERTAIN`; decisive answers without a word run in the
  source are held, both directions (false clearance == false alarm).
- **Injection (R-INJ-1, R-INJ-2)** — fence-shaped text neutralised with
  visible markers, never deleted; flags recorded at seal; injection never
  moves an outcome alone.
- **Reviewer and gate (R-REV-1..4, R-GATE-1, R-GATE-2)** — independence
  checks (opener and every host provider excluded), propose only on
  CLEAR, acceptance as the reviewer's own transaction, release exactly
  once, reasons listed by `get_gate`.
- **Agreement and canon (R-AGR-1, R-AGR-2)** — booleans as ints in
  pinned rows; decisions agreeing exactly with the leader's, prose left
  out.
- **Ownership (R-OWN-1)** — no path distinguishes the deployer.
- **A full clean flow** — provider binds, opener opens/freezes, panel
  agrees on CLEAR, stranger accepts appointment, gate releases.

`helpers.py` also carries the role fixtures: `operator` (opener/binder),
`provider`/`stranger` (unrelated parties), `reviewer` — so every test
states its roles explicitly.

Checks are local, run in one command: `node scripts/check.mjs` runs the
pytest suite, the web console's `npx tsc --noEmit` and `npm run build`.
The repository does not use GitHub Actions.

## What is not covered by hermetic tests and is covered elsewhere

The live chain behavior — consensus timing, CLI output shaping, refusal
detection on real receipts — is exercised by `scripts/live.mjs` and
`scripts/verify.mjs` against Studionet; see docs/END_TO_END.md.
