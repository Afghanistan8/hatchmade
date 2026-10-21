# End to end: the reference run on Studionet

`scripts/live.mjs` runs the whole protocol, with real consensus, against
the deployed gate. It is idempotent at the authority-binding step (it
reads `authority_bound` before each write and skips bound hosts), writes
a machine report to `scripts/out/live-<timestamp>.json`, and exits
non-zero at the first genuine contract refusal — because on this protocol
a *refusal is a result* and the run stops to show it.

## Fixtures

Four documents under `fixtures/`, served from three CDN mirrors whose
hostnames were bound live in sequence (bind order is real order, first
come is forever):

| host                      | kind          | document                          |
|---------------------------|---------------|-----------------------------------|
| `raw.githubusercontent.com` | `REGULATOR`   | `regulator-bulletin-recall-lot9751.txt` |
| `cdn.jsdelivr.net`        | `MANUFACTURER`| `manufacturer-notice.txt` + `clear-bulletin.txt` |
| `cdn.statically.io`       | `LOGISTICS`   | `outbound-manifest-lot9751.txt`   |

URL digests as pinned in the live report:

```
recall    ab9a8e7d8167df5d580d30b8805c76a1fa16e8c3b7babed44c096bed692696f2
clear     469a88803c91e0a1b735a8477e36f05558ebeabd99e48547e1a280ddac5d22fc
notice    9dd80e8be19d2984f08c3153f76dd4016cad00ff10fc75a5c7fa17a160f7d830
manifest  4c0324938dfe9bc60cea8ec4314c00e0b39dab8d3ca7632fe115ecdbb90a9796
```

Note the manufacturer host: a `repo@main` version marker *in the path*.
The URL gate (R-SRC-1) accepts it — userinfo is banned in the authority
section only, and this is exactly the case the first deployment got
wrong and was abandoned for (docs/DEPLOYMENT.md).

## The two cases

**C1 — the quarantine case.** Pin the regulator recall bulletin, the
manufacturer notice, the outbound manifest for `LOT-9751` (product
`Aero-Puck AP-1150`), seal, then request and execute an assessment. The
regulator bulletin is decisive and grounded: `RECALLED` on the regulator
source → outcome `QUARANTINE`, gate stays `BLOCKED`. The run then
re-checks the gate after the whole second case has released — the
quarantined gate does not move.

**C2 — the clear case.** Clear bulletin + notice + manifest, seal,
assess: every regulator reading `NOT_RECALLED`, no floors → `CLEAR`.
Gate: still `BLOCKED`. Then:

1. opener proposes `hatchmade-reviewer` (independence checked on chain:
   not the opener, not a host provider) — R-REV-1, R-REV-2;
2. the reviewer accepts from its own account — R-REV-3;
3. the reviewer releases, with a note — R-REV-4. Gate: `RELEASED`, once.

Both settlement runs end with decision digests that `scripts/verify.mjs`
recomputes independently from public views (R-AGR-1); the recomputation
matches what is stored.

## The refusal the run provokes on purpose

The scenario also demonstrates the protocol's refusals: sealing a packet
missing an authority kind is refused with `[INCOMPLETE_PACKET]`; pinning
from an unbound host or from a wrongly-shaped URL is refused with
`[HOST_UNBOUND]` / `[URL_REJECTED]`; binding an already-bound hostname is
refused with `[AUTHORITY_TAKEN]`. During integration these fired live and
were agreed by validator panels (real consensus, rollback receipt) — the
event that shaped the final URL rule is recorded in the first deployment
entry in docs/DEPLOYMENT.md.

## Running it

    node scripts/live.mjs      # HATCHMADE_CONTRACT optional; falls back to scripts/out/deployment.json
    node scripts/verify.mjs

CLI accounts must be unlocked with the genlayer CLI (`genlayer account
use`); the scripts never hold keys and switch accounts for writes.
Answers land in `scripts/out/live-<ts>.json` with per-step transaction
ids, case ids, packet and decision digests, and the final gate states.

## What the run proves

- authority bindings are per-host first-come and sticky (R-AUT-1);
- the packet seal is refused until all three kinds are pinned (R-FRZ-1);
- fetch and read agree across a real validator panel — the decision
  digest the panel signed is the one any third party recomputes (R-AGR-2);
- outcomes harden (R-CAL-2) and gates move only for a reviewer's
  signature (R-REV-4);
- a quarantined gate on C1 is *unmoved* by C2's release — per-case gates,
  no cross-talk.
