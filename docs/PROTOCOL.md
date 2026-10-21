# Hatchmade protocol — `hatchmade-gate-1`

Schema `hatchmade.evidence-gate@1`. This document is the specification of the
rule ids quoted in `contracts/hatchmade.py`. If a comment in the code and a
line here disagree, this document is the specification and the code is the bug.

Every record written by the contract also carries `rules` and `schema` inside
itself, so the vocabulary travels with the evidence rather than living only
here.

## 0. Scope and standing assumption

The protocol decides one thing: whether the product and shipment lot named by
a case lie inside an active recall, decided independently by GenLayer
validators against a frozen packet of sources, with the gate held closed
until an independent reviewer releases it.

It is explicitly **not**: a safety opinion on the product, a legal finding,
or proof that a shipment physically left a dock. This scope string is stored
in the contract itself (`get_protocol_info().scope`) — not a footnote here.

Conservative default, everywhere: **uncertainty fails closed.**

## 1. Vocabulary

| dimension     | values                                   |
|---------------|------------------------------------------|
| outcomes      | `NONE`, `CLEAR`, `REVIEW`, `QUARANTINE`  |
| gates         | `BLOCKED`, `RELEASED`                    |
| case states   | `OPEN`, `FROZEN`, `SETTLED`              |
| reviewer      | `NONE`, `PROPOSED`, `ACCEPTED`           |
| readings      | `RECALLED`, `NOT_RECALLED`, `UNCERTAIN`  |
| authority kinds | `REGULATOR`, `MANUFACTURER`, `LOGISTICS` |

Conservatism order: `NONE < CLEAR < REVIEW < QUARANTINE`. Worse outranks
better in every merge (R-CAL-2).

## 2. Rules

### Authorities — R-AUT

- **R-AUT-1** — *First binding is the only binding.* An authority is a
  hostname bound to one of the three kinds by the first account that binds
  it. Re-binding an already-bound hostname is refused
  (`[AUTHORITY_TAKEN]`); nothing — no user, no method, no owner key —
  unbinds or re-kinds a hostname.
- **R-AUT-2** — *Kinds come from the binding, never from the packer.* A
  case can pin sources only from hosts bound here, and a pinned source's
  kind is the kind of its bound host. A packer cannot wear a regulator
  badge by choosing metadata.

### Sources and URLs — R-SRC

- **R-SRC-1** — *URL shape before host.* A pinnable URL is `https://` only,
  carries no control characters, no fragment, and an authority section
  (the part before the first `/`) with no userinfo (`user@host`) and no
  port. A version marker in the *path* — `gh/user/repo@main/doc.txt` — is
  ordinary addressing and is allowed; userinfo and ports live only in the
  authority section, so that is where they are banned. The URL always names
  a path, and the host part is what later gets checked against the
  authority binding.
- **R-SRC-2** — *The case holds bytes, not links.* Pinning takes the exact
  body bytes from the opener, stores them, computes `sha256` over them and
  records the host's bound authority. Evaluators fetch the same URL
  themselves later; a source whose live bytes moved is a floor, not a
  footnote (R-FLO-1).
- **R-SRC-3** — *Taking back is recorded, never erased.* A source can be
  unpinned before the seal; it then stays in storage as a tombstone, leaves
  the packet's live list, and nothing pinned after it can be confused with
  it. No key in the contract exists for taking anything back after the seal.

### The freeze — R-FRZ

- **R-FRZ-1** — *Freeze is complete and digest-pinned.* Sealing refuses an
  incomplete packet (`[INCOMPLETE_PACKET]`): a regulator bulletin, a
  manufacturer notice and a logistics manifest must all be present, because
  a packet without the regulator document cannot judge recall scope and
  without the manufacturer notice and manifest it is not the complete
  evidence this protocol is about. Sealing computes one digest
  (`packet_sha256`) over all source rows
  `[[source_id, url, kind, host, pinned_sha256, byte_len], ...]` in pin
  order; every later assessment is pinned to that digest, so the packet an
  evaluator graded can always be recognised again. After the seal, nothing
  in the packet can change.

### Assessment assembly — R-ASM

- **R-ASM-1** — *Request is state, execute is work.* Any account may request
  an assessment on a frozen case; the request names the frozen packet digest
  and is a state change of its own. The reading arrives when
  `execute_assessment` finalises; a round that does not agree writes
  nothing, and the request survives it waiting to run again.
- **R-ASM-2** — *Agreed decisions in, deterministic outcome out.* The leader
  fetches every pinned source and reads every regulator bulletin; every
  validator repeats the whole run itself on a fresh fetch and a fresh
  reading and signs only when the decisions agree exactly (R-AGR-2).
  Nothing is written until the round agrees, and the deterministic floors
  (R-FLO-1) then turn the agreed decisions into an outcome that is
  *recorded, never asserted*.
- **R-ASM-3** — *One nondeterminism region.* All network and model calls
  live inside the runner's single nondeterministic block, written inline so
  both the runtime and the tests see the entire block as one function. Wire
  failures and unreadable answers are flattened into receipts and statuses
  instead of raised; the only thing that leaves this contract with nothing
  written is a round the nodes cannot agree about.

### Floors — R-FLO

- **R-FLO-1** — *Floors run before outcomes.* Evidence that is broken names
  itself; a gate that lets evidence break its chain and then argues about
  blame afterwards can be steered by whoever gets to pick the blame. The
  named floors, in check order:

  | floor             | condition                                             |
  |-------------------|-------------------------------------------------------|
  | `FETCH_STATUS`    | a source did not answer HTTP 200 (or the fetch itself failed) |
  | `NO_LIVE_BYTES`   | a source answered 200 with an empty body              |
  | `DIGEST_MISMATCH` | live bytes differ from the pinned bytes               |
  | `MODEL_READ`      | a reading came back malformed / unreadable            |
  | `GROUNDING_HELD`  | a decisive reading quoted nothing present in the source |
  | `INJECTION_*`     | the frozen packet carries speak-to-the-reader text    |

  Any floor present forces the outcome to at least `REVIEW`.

### Outcomes — R-CAL

- **R-CAL-1** — *Deterministic calibration of readings and floors.*

      QUARANTINE   a grounded RECALLED on any regulator source
      REVIEW       any floor, or any UNCERTAIN, or any held decisive answer
      CLEAR        every regulator source grounded NOT_RECALLED, no floors

- **R-CAL-2** — *Settling only hardens.* The settled outcome merges with the
  new one by taking the *worse* of the two. A case later proven worse can
  never be re-shown as better.

### Judging — R-JUD

- **R-JUD-1** — *One question per source.* Each regulator source is read
  with exactly one question, answered `RECALLED`, `NOT_RECALLED` or
  `UNCERTAIN`.
- **R-JUD-2** — *(in the prompt contract)* the reading must also record, at
  minimum, the basis the answer rests on — the quotation is what grounding
  later checks (R-GRD-2).
- **R-JUD-3** — *No repaired answers.* Prose wrapping in a model answer is
  tolerated; inventing a value that was not there is not. Anything that
  cannot be read raises, and a raised reading lands as `UNCERTAIN` under
  the floors rather than being repaired into a decision.
- **R-JUD-4** — *One source per call.* A prompt carrying five bulletins
  invites careful reading of the first and pattern-matching of the rest,
  and lets one squinted bulletin contaminate all of them, so the work is
  split: one call per regulator source.

### Grounding — R-GRD

- **R-GRD-1** — *Grounding applies both ways.* A `RECALLED` that quotes
  nothing present is held at `UNCERTAIN`, and so is a `NOT_RECALLED`. A
  false clearance is treated as exactly as unwelcome as a false alarm.
- **R-GRD-2** — *The word run.* A decisive answer's basis must carry a run
  of `word_run` (currently 6) consecutive words that literally occurs in
  the corresponding bulletin. Short fragments match by coincidence; full
  sentences live in the document. Anything that fails the run is held, not
  discarded — the case still sees the attempt.

### Prompt injection — R-INJ

- **R-INJ-1** — *Neutralised, never deleted.* Text shaped like the fence a
  document is read inside (`<<<` / `>>>` runs, role tags, fake ends) is
  replaced with visible markers, so nothing a document says can rewrite the
  fence it is being read in. A document that loses characters silently is
  a document nobody can audit — replacement, not removal, is the rule.
- **R-INJ-2** — *Recorded, never obeyed.* Injection-looking text is
  surfaced as per-source flags at seal time and travels with the packet;
  floors already hold anything ungrounded, so a planted instruction cannot
  move a status on its own, but the attempt stays visible to the reviewer.

### Agreement — R-AGR

- **R-AGR-1** — *Stable canonical form.* Digests are computed over
  `json.dumps(..., sort_keys=True, separators=(",", ":"))` canonical json;
  booleans are written as ints in pinned rows so the canonical form cannot
  drift between a node that writes `true` and one that writes `1`.
- **R-AGR-2** — *Agree on decisions, not on prose.* Validators sign only
  when the per-source decisions are **exactly** what the leader's were —
  fetched-or-not (int), matched-or-not (int), effective reading per
  regulator source. The wording of a quotation and the basis sentence are
  deliberately left out: two honest readers never cite the same words, and
  holding the prose decisive would fail every round while making nothing
  safer.

### The reviewer — R-REV

- **R-REV-1** — *Independence before anything.* Reviewing is refused for
  the case opener and for every account provider of a host pinned in the
  case's packet; no path exists for owner-style overrides (there is no
  owner, R-OWN-1).
- **R-REV-2** — *Appointed on a CLEAR, and present.* Proposal opens only
  after a settled `CLEAR` — a gate that may yet quarantine has no release
  to hand out — the candidate is checked for independence against the
  case's own record, and must accept before the appointment holds, so
  nobody is handed a key they never asked for or holds one under a name
  that is not theirs.
- **R-REV-3** — *Acceptance is the reviewer's own transaction.* An address
  does not become this case's reviewer until the account holding it says
  so, with its own signature.
- **R-REV-4** — *Release once, and the door shuts behind it.* Release is
  signed by an accepted reviewer while the settled outcome is still CLEAR;
  a later assessment that quarantines the lot hardens the settled outcome
  first, so releasing then never happens either. The release is final and
  once: no reopen, no re-close, no further appointment.

### The gate — R-GATE

- **R-GATE-1** — *Blocked by default, always.* The gate is a state the case
  carries (`BLOCKED` until release), not an opinion emitted by code.
- **R-GATE-2** — *Blocked reasons are named.* `get_gate` returns the gate
  plus the reasons it is where it is (no accepted reviewer, settled
  outcome not CLEAR, case still open, already released, ...), so clients
  show why, not just what.

### Errors — R-ERR

- **R-ERR-1** — *Machine-readable heads.* Every refusal starts with a
  bracketed class (see the catalog below). A client reacts to the head,
  never to the prose behind it.
- **R-ERR-2** — *The catalog is an interface.* `get_error_catalog()`
  publishes every refusal class with a line on each — the contract
  describes its own failures.

### Case identity — R-CASE

- **R-CASE-1** — *Identity from the record, not the mood.* Every page and
  every history line binds to `case_id`/`assessment_id`/`source_id`
  labels allocated from counters and written before anything else happens,
  so the panel reads exactly the label the record claims later.

### Ownership — R-OWN

- **R-OWN-1** — *Deployer is not an owner.* The deployer's address is
  recorded and consulted by nothing. No owner path, no upgrade path, no
  privileged address, no pause: the deployer can do exactly what anyone
  else can.

## 3. Refusal catalog

Published on chain by `get_error_catalog()`; heads are the interface (R-ERR-1):

| head                    | means                                                       |
|-------------------------|-------------------------------------------------------------|
| `[GATE_RULE]`           | the step is not one the protocol takes on this state        |
| `[INVALID_INPUT]`       | a value does not pass its basic shape check                 |
| `[LIMIT]`               | a value is over one of the ceilings below                   |
| `[WRONG_STATE]`         | the record is not in the state this step needs              |
| `[NOT_FOUND]`           | no such record on this contract                             |
| `[UNAUTHORIZED]`        | the caller does not hold the role this step needs           |
| `[AUTHORITY_TAKEN]`     | a hostname is already bound; first binding is the only one  |
| `[AUTHORITY_KIND]`      | the kind is not one of the three                            |
| `[HOST_UNBOUND]`        | no authority is bound to a pinned URL's host                |
| `[URL_REJECTED]`        | the URL fails the shape gate (R-SRC-1)                      |
| `[DIGEST_MISMATCH]`     | a claimed digest does not match the pinned bytes            |
| `[INCOMPLETE_PACKET]`   | the packet is missing a required authority kind             |
| `[NOT_CLEAR]`           | reviewer steps exist only after a CLEAR outcome             |
| `[REVIEWER_LOCKED]`     | an accepted reviewer cannot be replaced                     |
| `[ALREADY_RELEASED]`    | the gate already opened; once, never twice                  |
| `[PENDING]`             | too many unfinished assessment rounds on this case          |
| `[PACKET_MISMATCH]`     | the step binds a different packet digest                    |
| `[PANEL]`               | the panel did not agree; nothing was written                |
| `[FROZEN_PACKET]`       | the packet is frozen and can no longer be edited            |

## 4. Ceilings

Published by `get_protocol_info().limits`, enforced on chain, live from the
deployed contract: at most 12 sources per case, 30 000 bytes per source,
400-char URLs, 100-char hostnames, 120/64-char product/lot, 5 pending
assessment rounds, and a 100-item page. A value at a ceiling is refused with
`[LIMIT]`; nothing is truncated.

## 5. Digests (recomputable, R-AGR-1)

- **packet digest** — sha256 over the canon of
  `[[source_id, url, kind, host, pinned_sha256, byte_len], ...]` in pin
  order, stored at seal as `packet_sha256`.
- **decision digest** — sha256 over the canon of
  `[[source_id, fetch_ok(int), digest_match(int), effective], ...]`
  sorted by `source_id`, stored per finalized assessment as
  `decision_digest`.

Both are recomputable from public views alone; the web console does it in
the browser (SubtleCrypto), and `scripts/verify.mjs` does it against the
CLI. The canonical json is `sort_keys` + `,`/`:` separators.
