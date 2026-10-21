# Architecture

One contract file, `contracts/hatchmade.py`, organised so that the boundary
between purely deterministic code and the one nondeterministic surface is
the whole design. The file has six parts:

1. **codes, rule ids and bounds** — the vocabulary (`OUTCOMES`, `CASE_STATES`,
   ...), the refusal heads (`[URL_REJECTED]`, ...), and one ceiling per
   record field. Every ceiling is enforced on chain; nothing is silently
   truncated.
2. **pure helpers** — canonical json, digests, shape checks (hosts, URLs,
   digests), the URL shape gate, injection fencing and scan, and the
   word-run grounding floor.
3. **the deterministic core** — receipt rows, floors, outcome calibration,
   worse-of merge, agreed-decision building.
4. **the prompt** — one question, one regulator source, no context beyond
   itself (R-JUD-1, R-JUD-4) plus the strict answer contract.
5. **panel plumbing** — the *only* place nondeterminism is allowed: the
   runner's nondet block, containing the fetches (`gl.nondet.web.get`) and
   the reads (`gl.nondet.exec_prompt`), written inline so both the runtime
   and the tests treat it as one function (R-ASM-3).
6. **class Hatchmade** — the public contract: authorities, cases, packets,
   assessments, reviewer appointment and release, views.

Parts 1–5 are pure functions over plain Python values. The test suite
imports the contract file and calls those parts exactly the way the on-chain
code calls them — that is what makes 59 fast, hermetic tests possible, and
it is also why the on-chain behavior and the tests cannot drift apart
quietly:

    the tests are the same functions, called the same way

## State layout

- `authorities: TreeMap[hostname, dict]` — hostname → {kind, provider,
  note, seq}; first binding is the only binding (R-AUT-1).
- `cases: TreeMap[case_id, dict]` — id `C{n}` from a counter; the case
  carries product, lot, opener, state, packet fields, assessment ids,
  history, and the gate block.
- `sources: TreeMap[source_id, dict]` — id `C{n}#m`; body bytes, pinned
  sha256, byte length, bound kind. Unpins leave tombstones (R-SRC-3).
- `assessments: TreeMap[assessment_id, dict]` — id `A{n}`; status,
  receipts, judgments, floors, decisions, decision digest.
- page/history keys are prefixed (`case`, `authority`, `assessment` …) so
  maps never alias.

Views are paginated (`offset`, `limit`, `total`); every record carries its
rule vocabulary (`rules`, `schema`) inside itself, and the gate record
carries its own reasons (R-GATE-2).

## The two digests

- **packet digest** — canon of `[[source_id, url, kind, host, pinned_sha256,
  byte_len], ...]` in pin order; computed once at seal, attached to every
  later request and assessment (`packet_sha256`, R-FRZ-1).
- **decision digest** — canon of `[[source_id, fetch_ok(int),
  digest_match(int), effective], ...]` sorted by `source_id`; the exact
  thing the panel agrees on (R-AGR-2), stored per finalized assessment
  (`decision_digest`).

Booleans are pinned as ints (R-AGR-1) so nodes that render `true` and
nodes that render `1` produce identical bytes. Both digests are
recomputable from public views alone (`scripts/verify.mjs`, and the
`/verify` route of the console).

## The assessment round

    request_assessment   (any account, on a frozen case)
        a state change naming the frozen packet digest; survives a
        disagreeing round (R-ASM-1)

    execute_assessment   (any account, on a requested assessment)
        leader:  fetch every pinned source, read every regulator
                 bulletin once each, decide per source
        validators: repeat the whole run themselves — fresh fetches,
                 fresh readings — and sign only when the decisions agree
                 exactly with the leader's (R-ASM-2, R-AGR-2)
        agree:   deterministic floors + calibration turn the agreed
                 decisions into the recorded outcome (R-FLO-1, R-CAL-1)
        disagree: nothing is written; the request stays, waiting

The one nondeterministic region (R-ASM-3) flattens every wire or model
failure into a receipt row and a status, so the round always ends in
something readable — the floors then decide what that means for the
outcome.

## The console

`web/` is a Next.js App Router application; everything runs in the browser
against the Studionet RPC (reads) and the user's EIP-6963 wallet (writes,
via genlayer-js with the injected provider). It assumes nothing: connected
wallets are discovered and the user picks one; the chain is verified and
switched/added only with an explicit request; every contract refusal is
surfaced with its catalogue line. Digest recomputation in `web/lib/digest.ts`
mirrors the contract's canon byte-for-byte and runs in SubtleCrypto — the
"verify" route needs no trust in the console at all: it shows the stored
digests next to the recomputed ones.
