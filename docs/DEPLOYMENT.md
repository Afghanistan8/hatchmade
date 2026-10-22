# Deployment

Network: **GenLayer Studionet** — RPC `https://studio.genlayer.com/api`,
chain id `61999`. Nothing else is supported; the contract itself records
`network: "studionet"`.

## The runner pin, and why it is not an alias

Line 1 of `contracts/hatchmade.py`:

```
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
```

This is the full length-pinned runner content-address, not the
`py-genlayer:latest`-style alias. The HTTP and LLM namespaces
(`gl.nondet.web.get`, `gl.nondet.exec_prompt`) respond through the runner,
and their behavior is part of this protocol's consensus: two nodes on a
different runner version could diverge on fetch framing or prompt
handling. The pin is checked at deploy time by `scripts/deploy.mjs`
before anything is sent, and each panel node re-verifies it as part of
repeating the run.

## Accounts

Deployed with the user's own unlocked genlayer CLI keystore; **scripts
never hold keys** — the CLI resolves the account, the scripts call the
CLI. Used in the reference run:

| role               | address                                    |
|--------------------|--------------------------------------------|
| deployer (opener/binder in the scenario) | `0x4184bc5e5444f250767e8d33a49817a9b4fb0df3` |
| `hatchmade-exec`   | `0xef18c89f28e4f1aa2a7f180efce01b423f7bde0b` |
| `hatchmade-reviewer` | `0x1b7e06bcd6d4b15b14ecac6baf40db1757d9062f` |

Role accounts are bootstrapped by `scripts/bootstrap-accounts.mjs`
(funded, passwords written to a gitignored `.env`).

The contract records the deployer's address but consults it for nothing
(R-OWN-1): after this transaction, that key is exactly as privileged as
anyone else's.

## Current deployment

| field                | value                                                    |
|----------------------|----------------------------------------------------------|
| contract             | `0xF0B8cDe8E1d3677c88296E591eCd0b917214043B`             |
| deploy tx            | `0x323537fef77965b19b7c81824e8fa33494af5e9895828e8e842a053265abcf4e` |
| deployed at          | 2026-10-22T13:52:48.971Z                                 |
| rules / schema       | `hatchmade-gate-1` / `hatchmade.evidence-gate@1`          |
| source sha256        | `57ef9b8fc82d76abdfddd8db9917363ba865c7516d842c335fce12b4f474b184` |
| deployed code sha256 | `8a1391a8d29c938009014df5a1b7c9e82f26953d582960d11ac9efe176f08109` |

The canonical machine record lives in `scripts/out/deployment.json`
(committed), including abandonment history.

### Early addresses, and why they were abandoned

- `0xc1a79F5c729199561ce2eEf06309B833193BF3b9` — deployed during
  integration, then abandoned. Its URL gate treated a `@` anywhere —
  including the version marker in `cdn.jsdelivr.net` repo paths — as
  userinfo, which made a legitimately pinned manufacturer source
  unfetchable under R-SRC-1; the error surfaced during the live run as
  validators agreeing on `[INCOMPLETE_PACKET]` at seal, *the protocol's
  own refusals firing on chain*, which is recorded part of the story.
  Authority bindings were already taken there (first binding is forever),
  so the correct fix was a redeploy with the corrected rule
  (userinfo banned in the authority section only), not a mutation: there
  is nothing mutable about a Hatchmade deployment — no upgrade, no owner,
  no admin (R-OWN-1). No protocol state of value existed on it.
- `0x7a88389Bd7c340D48Dc1802Ac32Ea6b7E652133B` — superseded after steward review found that leader display data could affect settlement even though the decision digest was agreed. The replacement reconstructs floors and outcome only from validator-agreed decisions and frozen packet flags.
- `0xF0B8cDe8E1d3677c88296E591eCd0b917214043B` — current.

## Deploy / verify

    node scripts/deploy.mjs    # deploy, verify get_protocol_info, write manifest
    node scripts/verify.mjs    # recompute digests from public views on the address in HATCHMADE_CONTRACT or the manifest

The deploy script refuses to finish unless `get_protocol_info` answers
with `hatchmade-gate-1`. Watch the contract on the explorer:
https://explorer-studio.genlayer.com/address/0xF0B8cDe8E1d3677c88296E591eCd0b917214043B

## The Studionet read rate limit, and how the run gets past it

The hosted RPC throttles anonymous reads: `gen_call` executions measure
`x-ratelimit-bucket: standard` with a **30 requests / minute** window, and
an over-quota client gets `Rate limit exceeded: 30 requests per minute`.
Two facts learned from the gateway itself shape the answer:

1. **The limit is per HTTP request, not per call.** A POST carrying a
   JSON-RPC *batch* of N `gen_call` requests consumes one slot: measured
   live, a single call moved `x-ratelimit-remaining` from 22 to 21, and a
   one-POST batch of three moved it from 22 to 21 again while answering
   all three (this also rules it out as a coincidence of window edges.
   Repeatedly reproduced.)
2. **An API key lifts the quota.** The Studio app attaches the key saved
   at `studio.genlayer.com/settings` to every request as the HTTP header
   `X-API-Key` (checked in the served app bundle: `settingsStore.apiKey`),
   and the settings page itself states that without a key the anonymous
   limits apply.

What the project does with that:

- `scripts/lib/rpc-batch.mjs` wraps `globalThis.fetch` for POSTs to the
  RPC only: concurrent `gen_call`s merge into one batched POST and each
  waiter receives its own single-entry response shaped exactly like the
  gateway's, so the SDK transport parses it unchanged. A 429 or a gateway
  outage retries with backoff inside the flush. It also sends
  `HATCHMADE_STUDIO_API_KEY` (when set) as `X-API-Key` — this is an RPC
  quota key, not wallet material, and the scripts never hold keys.
- `scripts/verify.mjs` issues its reads in waves. Twenty-six on-chain
  reads land in **four HTTP POSTs** (two singles + two batches of
  twelve), comfortably inside the anonymous quota.
- The web console gets the twin shim (`web/lib/rpc-batch.ts`, installed
  in `web/lib/client.ts`), so its parallel page reads ride the same
  batching. It optionally reads `NEXT_PUBLIC_HATCHMADE_STUDIO_API_KEY`
  for the authenticated bucket.
- Notes on limits are the *read* path only — consensus writes are no
  cheaper to fake, and nothing here batches them.

## Notes picked up during integration (worth keeping)

- The RPC answers only checksummed addresses; lowercase hex reads back
  "Contract not found". Scripts and the console pin the checksummed form.
- The genlayer CLI prints JavaScript object literals (bare keys,
  single-quoted values); `scripts/live.mjs` normalizes them rather than
  trusting a quoting assumption.
- Command tolerances: an empty `--args` list is *omitted*, not passed;
  a genuinely refused write carries `exit_code 1` in the receipt, while
  validators cancelled after quorum also print `execution_result: ERROR`
  with `VALIDATOR_QUORUM_REACHED` in perfectly good transactions — a
  fact that must not, and does not, get parsed as failure.
- Studionet consensus is minutes, not seconds: the CLI tools wait for
  `FINALIZED` with generous retries.
