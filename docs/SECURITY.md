# Security

Hatchmade is a fail-closed gate. This document states what it guarantees,
and — just as important — what it does not.

## Guarantees

**Role isolation.** The opener, the source providers, and the reviewer are
different parties by construction, and the contract enforces the isolation:

- the reviewer candidates exclude the opener and all provider accounts of
  the hosts pinned in the case packet (R-REV-1);
- the appointment must be proposed and then *accepted by the candidate's
  own transaction* (R-REV-3), so nobody is handed a key they never asked
  for;
- an appointment is possible only after a settled `CLEAR` (R-REV-2), and
  a later assessment can harden the outcome before anyone walks through
  the door (R-REV-4);
- `register_authority` on an already-bound hostname is refused; kinds come
  from the binding, so a packer cannot wear a regulator badge (R-AUT-1,
  R-AUT-2).

**No privileged key, ever.** The deployer is recorded in state and consulted
by nothing (R-OWN-1). There is no owner, no admin, no pause, no upgrade
path: fixing or extending the gate means deploying a new contract at a new
address. No method moves funds of any kind.

**Fail-closed everywhere.** The settlement order is `NONE < CLEAR < REVIEW
< QUARANTINE`; settling takes the *worse* outcome (R-CAL-2). A fetch that
broke, a digest that moved, a malformed reading, an ungrounded quote, or
injection-shaped text is a named floor that forces at least `REVIEW`
(R-FLO-1). A round that cannot agree writes nothing (R-ASM-2, R-ASM-3).

**Digest over trust.** The packet digest is computed at seal and attached
to every assessment; the decision digest is the exact thing validators
agree on (R-AGR-2). Both are recomputable from public views alone —
`scripts/verify.mjs` and the console's `/verify` route do it locally,
without asking any node to be believed.

**Prompt-injection containment.** Documents are read inside a fence that
the documents cannot rewrite: fence-shaped text is neutralised with
visible markers, never silently deleted (R-INJ-1). Injection-looking text
is flagged at seal and travels with the packet (R-INJ-2); a planted
instruction cannot move an outcome because a decisive answer must carry a
literal word run from the source itself (R-GRD-2), in both directions
(R-GRD-1).

**URL shape gate.** Only hostless-`https` URLs name an authority binding;
userinfo, ports, fragments, control characters and paths are refused
before any fetch (R-SRC-1), so the authority the contract fetches from is
always the authority somebody first bound.

## What this does not do

- **It does not store the web.** It stores pinned *bytes* the opener
  brings. If a formally-authoritative host is taken over and live bytes
  agree with the pins on the wrong text, the gate still reads that text;
  the defense is that validators check the pins (the opener's bytes),
  not trust the host's future behavior (R-FLO-1). Like the rest of the
  pipeline, the recall *content* is only as good as the bound sources.
- **It is not pushback against the regulator.** A readline of a hostile
  bulletin (`QUARANTINE`) is a *censor* result, not surveillance on the
  lot; quarantine of a good lot is possible if a bulletin over-reaches.
- **It does not decide quality.** It decides recall-scope membership. The
  scope string in the contract says this in one breath.
- **Not a safety opinion on the product; not a legal finding; not proof
  that a shipment physically left a dock.** Cases throttle evidence into
  one direction; the manifest is a pinned document, not a customs stamp.
- **The manifest is not the DOM.** A correct manifest is accepted as
  body bytes; the protocol does not type the graphic content of
  attachments.
- **Word-run grounding (6 words)** defeats happy-clicking quotes but not
  paraphrases anchored on a single idiom; the model that would succeed in
  lifting two truthful sentences from *different* sources would still
  fail the run. Text-level, deterministic, and auditable — not a full
  semantic-arbitration answer.
- **Combining unrelated sources is out of scope.** A case names one
  product and one lot; it is not a general compliance database.

## Threat model highlights

| threat                                | status                                   |
|---------------------------------------|------------------------------------------|
| Bespoke "clear the goods" packet      | refused: an incomplete packet is refused (all three kinds required) |
| Provider lies about their own host    | useless: kinds bound by host, from whoever binds first; packers can't re-badge |
| A validator inflates/deflates in round| rejected: every validator repeats the *whole* run; decisions must match the leader's exactly |
| Trust a leader's story                | not needed: validators sign on *their own* fetch and reading |
| Reader manipulating a decision        | ungrounded decisive readings are held to UNCERTAIN; round outcome REVIEW (fail closed) |
| Injection inside a bulletin           | neutralised at read time, flagged at seal (never moves an outcome alone) |
| A compromised "release" call          | only an appointed, accepted reviewer while the settled outcome is CLEAR; once ever, independent of the opener and providers |
| Any upgrade/admin "just in case"      | nothing to hack: no such key exists in the contract |

## Reporting

The source is open at github.com/Afghanistan8/hatchmade. This is a
consortium Studionet build — direct a report through that repository.
