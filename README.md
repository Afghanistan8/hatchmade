# Hatchmade

**Hatchmade** is a GenLayer-native outbound recall / shipment evidence gate.

An operator registers authority sources by hostname, opens a case for a
product lot, and freezes a complete evidence packet — a regulator bulletin,
a manufacturer notice, and an outbound manifest — each held as exact pinned
bytes. Independent GenLayer validators then fetch every source themselves,
check the fetched bytes against what was frozen, and read the regulator
bulletins to decide whether the lot lies inside an active recall. Ordinary
deterministic code turns those readings into one outcome:

    QUARANTINE   an authoritative bulletin covers this product and lot
    REVIEW       uncertain, incomplete, or conflicting evidence
    CLEAR        authoritative sources affirm the lot is outside recall scope

A `CLEAR` result still leaves the gate **BLOCKED**. Only an appointed
*independent reviewer* — an address that is neither the case opener nor any
source provider — can open the gate, and only once.

Three sentences about what this refuses to be:

- **Not a safety opinion.** The scope, written into the deployed code
  itself, says exactly what each record claims — and what it does not.
- **Not steerable.** No owner, no admin, no upgrade key exists after
  deployment; no path in the contract moves funds; uncertainty always
  fails closed.
- **Not trusted when it matters.** Validators fetch and read every source
  themselves; the packer's own wording is never believed about the recall.

## Where things live

| path                        | what it is                                           |
|-----------------------------|------------------------------------------------------|
| `contracts/hatchmade.py`    | the gate, one file, six parts                        |
| `tests/`                    | Direct Mode suite, 59 tests                          |
| `scripts/deploy.mjs`        | deploy + on-chain verification + manifest            |
| `scripts/live.mjs`          | full reference scenario against Studionet            |
| `scripts/verify.mjs`        | recompute packet + decision digests from the chain   |
| `scripts/bootstrap-accounts.mjs` | fund the role accounts (passwords stay local)   |
| `web/`                      | Next.js console over the deployed gate               |
| `fixtures/`                 | the four evidence documents used by the live run     |
| `docs/`                     | PROTOCOL · ARCHITECTURE · SECURITY · DEPLOYMENT · TESTING · REVIEW_TARGET · END_TO_END |

Deployed on **GenLayer Studionet** (chain `61999`, RPC
`https://studio.genlayer.com/api`), contract
[`0x7a88389Bd7c340D48Dc1802Ac32Ea6b7E652133B`](https://explorer-studio.genlayer.com/address/0x7a88389Bd7c340D48Dc1802Ac32Ea6b7E652133B).
Deployment history, including an abandoned first address and why, is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Quick start

Local checks (one command; the repository uses no GitHub Actions):

    node scripts/check.mjs            # pytest + tsc + lint + build

Against the live contract (genlayer CLI installed and unlocked with its
own keystore; scripts never hold keys):

    node scripts/live.mjs          # full scenario: freeze → assess → release
    node scripts/verify.mjs        # recompute digests from public views

The scenario adopts any interrupted case where it stopped, then opens the
ones that are missing — one inside an active recall (quarantined, gate
blocked) and one outside it (clear, then appointed, accepted, and
released by an independent reviewer) — and writes
`scripts/out/live-<timestamp>.json`. Reads are batched so the hosted
RPC's 30-requests-per-minute read quota is not in the way: details in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Design in one screen

1. **Freeze** — the packet seals all three authority kinds as pinned bytes
   with digests. After the seal, nothing in it can change (R-FRZ-1).
2. **Inspect** — validators fetch each source themselves; live bytes are
   checked against the pins before anything else is believed (R-FLO-1).
3. **Ground** — a decisive reading must carry a literal run of six
   consecutive words from the bulletin it read. Anything else is held at
   `UNCERTAIN` (R-GRD-2) — including confident clearances (R-GRD-1).
4. **Settle** — outcomes only ever harden (R-CAL-2).
5. **Release** — an appointed, accepted, independent reviewer opens the
   gate exactly once (R-REV-4). Nobody can re-close or reopen it.

Rule ids are defined once in [docs/PROTOCOL.md](docs/PROTOCOL.md); if a code
comment and the document disagree, the document wins and the code is the bug.

## The web console

Five routes, no assumptions about your wallet (EIP-6963 discovery; you
choose, OKX/MetaMask/Rabby/…), everything live from the chain:

- **Overview** — protocol info, trust placement
- **Cases** — open a case, freeze its packet, run assessments, watch gates
- **Authorities** — hostnames and kinds, first come, never re-bound
- **Verify** — recompute packet and decision digests in your browser
- **Protocol** — ceilings, refusal catalog, vocabulary, both live

    cd web && npm run dev

## Status

Contract deployed and exercised end-to-end on Studionet; the reference
scenario, its refusal paths, and the digest recomputation all run against
the live chain. See [docs/END_TO_END.md](docs/END_TO_END.md) for the
recorded run and [docs/SECURITY.md](docs/SECURITY.md) for the trust model
and its honest limits.
