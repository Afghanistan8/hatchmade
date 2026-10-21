# End to end: the reference run on Studionet

`scripts/live.mjs` runs the whole protocol, with real consensus, against
the deployed gate. It is rerun-safe: authority bindings are re-read
before each write and skipped when bound; an interrupted case is adopted
where it stopped (pins deduplicate by URL); transient RPC failures
retry; and it writes a machine report to `scripts/out/live-<timestamp>.json`.
At the first genuine contract refusal the run exits non-zero — on this
protocol *a refusal is a result*, and the run stops to show it.

## Fixtures

Four documents under `fixtures/`, served from three CDN mirrors whose
hostnames were bound live in sequence (bind order is real order, first
come is forever):

| host                      | kind          | document                          |
|---------------------------|---------------|-----------------------------------|
| `raw.githubusercontent.com` | `REGULATOR`   | `regulator-bulletin-recall-lot9751.txt`, `regulator-bulletin-clear-lot9751.txt` |
| `cdn.jsdelivr.net`        | `MANUFACTURER`| `manufacturer-notice.txt`         |
| `cdn.statically.io`       | `LOGISTICS`   | `outbound-manifest-lot9751.txt`   |

Served-bytes digests, recomputed by every fetcher:

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

Note also that the *clear* regulator bulletin is served from the
REGULATOR-bound host: the kind of a pinned source is the kind of its
host's authority (R-AUT-2), and a packet without a REGULATOR source
cannot seal — the run leaves one such refusal on the record (below).

## The four cases

The chain now carries four cases, and they are not four identical runs:
two came from the integration passes and record honest refusals, two
are the clean end-to-end demonstration.

**C1 — the quarantine case, refused almost everything, honestly**
(`SETTLED` / `REVIEW`, gate `BLOCKED`).

During early integration, the case runner sent the pinned bodies
through a shell transport that mangled multi-line arguments; only the
first line of each document reached the chain (51 / 41 / 42 bytes,
pinned under `45ad282d…`, `a6f95026…`, `9dcf1582…`). The validators
then fetched the real documents live and every digest mismatched:
```
A1: floors  DIGEST_MISMATCH (C1#1) DIGEST_MISMATCH (C1#2) DIGEST_MISMATCH (C1#3)
    outcome REVIEW, decision digest fc00b45b49866f36cd398b1f9ea1285aa752eaa5150c16d287ef5b42b6dc648e
    packet digest  37bec8fa2e53228420bcc1182bc8fe47e8fe994acb639b40cb6fdbb53eac980d
```

The live reader had actually judged the recall correctly (`RECALLED`,
grounded) — and the outcome still failed closed to `REVIEW`, because
three floors beat the reading (R-FLO-1 over R-ASM-4). This is the
protocol's honest quarantine posture on uncertain evidence, and the
case is left on-chain exactly as it settled.

**C2 — the packet that cannot seal** (`OPEN` forever, gate `BLOCKED`).

The clear bulletin was pinned — deliberately, as recorded in the
commit history — from the MANUFACTURER-bound mirror, so the packet
carried two manufacturer kinds and no regulator. The seal refused:

```
payload: '[INCOMPLETE_PACKET] the packet does not carry a REGULATOR source; pin one before sealing'
```

The runner's refusal detector caught it from the rollback receipt;
the case stays `OPEN` and unsealable — the first rule of the freeze
enforced live, on real consensus (R-FRZ-1).

**C3 — the quarantine case, clean** (`SETTLED` / `QUARANTINE`, gate
`BLOCKED`).

The regulator recall bulletin, notice, manifest — all pinned with
byte-exact transport, so the validators' live fetches matched:

```
A2: floors  none
    receipts   pinned_sha256 == live_sha256 on all three sources
    judgment   RECALLED, grounded, basis names the lot range including LOT-9751
    outcome    QUARANTINE, decision digest a3cf05d7bc92b1fce4738ad134b7ca438017bf3cc2b87ffa53176518f7cf4e4b
    packet digest  29c50202c182ffe45425af6447047caf76c071123d1e4aa2ea38b5cb30bd7741
```

The reading says RECALLED, grounded, zero floors → `QUARANTINE`
(R-ASM-4, R-CAL-2). The gate stays `BLOCKED`: nothing unpins, nothing
re-opens, and only a reviewer can change it.

**C4 — the clear case, released once** (`SETTLED` / `CLEAR`,
`RELEASED`).

Same lot, the bulletin that excludes it, byte-exact everything:

```
A3: floors  none
    judgment   NOT_RECALLED, grounded, basis names the exclusion range (LOT-9700…LOT-9704)
    outcome    CLEAR, decision digest 8bc34e496627d6eb5442c48c1d5e2239490a14a4db86dd3b4519daa24c9a143c
    packet digest  a755c37f7f0fea56ad72a1d7e2755545d698badb2436fd6958a7bc4cf3672a46
```

Then the release path, every step from its own account:

1. opener proposes `hatchmade-reviewer` (`0x1b7e06bc…062f`) —
   independence checked on chain: not the opener, not a host
   provider (R-REV-1, R-REV-2);
2. the reviewer accepts from its own account (R-REV-3);
3. the reviewer releases with a note — `released_at`
   `2026-10-21T08:17:22.012385Z` (R-REV-4). Gate: `RELEASED`, once.

And the cross-check the protocol exists for: after C4 released,
**C3's gate stayed `BLOCKED`** (`CASE1_STILL_BLOCKED` in the report).
Per-case gates, no cross-talk.

Every settlement above ends with digests that `scripts/verify.mjs`
recomputes independently from public views (R-AGR-1) — the packet
digest, the decision digest, and each pinned body hash — and the
recomputation matches what is stored:

```
[packet] OK  a755c37f…; [sheet A3] digest OK …; [gate] RELEASED (outcome CLEAR)
[packet] OK  29c50202…; [sheet A2] digest OK …; [gate] BLOCKED (outcome QUARANTINE)
[packet] not sealed — no frozen digest to recompute
[packet] OK  37bec8fa…; [sheet A1] digest OK … floors 3; [gate] BLOCKED (outcome REVIEW)
[VERIFY] all packet digests, decision digests and body hashes recompute: PASS
```

## What the run proves

- authority bindings are per-host first-come and sticky (R-AUT-1);
- the packet seal is refused until all three kinds are pinned, on real
  consensus, with the refusal text on-chain (R-FRZ-1);
- pinned bytes are the inspected bytes: when they diverged (C1) the
  panel read and matched and refused anyway (R-FLO-1), and when they
  match (C3, C4) the grounded reading settles outright (R-ASM-4);
- the decision digest the panel signed is the one any third party
  recomputes from the public record (R-AGR-2);
- outcomes harden (R-CAL-2) and gates move only for a reviewer's
  signature, once (R-REV-4);
- a quarantined gate on C3 is *unmoved* by C4's release.

## Running it

    node scripts/live.mjs      # HATCHMADE_CONTRACT optional; falls back to scripts/out/deployment.json
    node scripts/verify.mjs    # batched reads; see docs/DEPLOYMENT.md on rate limits

CLI accounts must be unlocked with the genlayer CLI (`genlayer account
use`); the scripts never hold keys and switch accounts for writes.
Answers land in `scripts/out/live-<ts>.json` with per-step transaction
ids, case ids, packet and decision digests, and the final gate states.

## What the reference report contains

`scripts/out/live-2026-10-21T08-18-04-370Z.json` is the completed end
to end: three authority bindings (skipped, already bound), C3 adopted
after an interrupted earlier pass, three pins (one new), one seal, one
assessment round each (A2 executed by `hatchmade-exec`, A3 executed by
`hatchmade-exec`), the reviewer proposal/acceptance/release by
`hatchmade-reviewer`, and both gate states (`BLOCKED`, `RELEASED`) with
the digest ledger recomputed by `verify.mjs`.
