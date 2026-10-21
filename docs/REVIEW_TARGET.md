# Review target

What an independent reviewer should actually check before releasing a
gate — and how to check it here.

The reviewer's job in this protocol is deliberately narrow: after the case
has settled `CLEAR`, walk the released evidence yourself and sign the
release if it is real. The contract will not let anyone else through that
door, and it will not let the reviewer's own optimism reach the outcome —
that is what the assessment already did, with its own fetches and its own
readings.

## The checklist

1. **Case facts.** `get_case` — the product and lot are the ones you mean
   to release; the opener is who you believe filed it; the case is
   `SETTLED` with a `CLEAR` outcome.
2. **The packet is complete and frozen.** `get_packet` — all three
   authority kinds present (`REGULATOR`, `MANUFACTURER`, `LOGISTICS`);
   `sealed`; the stored `packet_sha256` is the digest over the source rows.
3. **Dig up the sources live, yourself.** Visit every pinned URL. Compare
   what you see with `get_source_body` — exact pinned bytes, not a
   summary. In this build the sources were mirror fixtures on three CDN
   hosts; the *substance* check is that each document says what the case
   needs it to say: the regulator bulletin names the product and lot
   outside recall scope, the manufacturer notice concurs, the manifest
   is the right shipment.
4. **The assessment did its own work.** `get_assessment` of the final
   round — every source fetched (`fetch_ok`), digests matched
   (`digest_match`), every regulator reading is `NOT_RECALLED` and not
   held. The `floors` list is empty.
5. **The decision digest recomputes.** `scripts/verify.mjs` (or the
   console's `/verify` route, in-browser) recomputes the packet digest
   and every finalized assessment's decision digest from public views
   only. They must match the stored values byte for byte.
6. **Independence, from the record, not from trust.** You are not the
   opener; you are not the provider of any bound authority for the hosts
   pinned in the packet. The contract checks this too (R-REV-1) — then
   sign.

## Then

`accept_reviewer` (your own transaction), then `release_gate` with a note
describing what you checked. That is the release. It is final: assessed
again later, the outcome may harden to `REVIEW`/`QUARANTINE` — but no
further release is possible and none is needed; the gate does not re-close
once open, and nothing in the contract can shut it again.

## What you should refuse

- Releasing on the strength of another party's summary of the sources.
  The pin list is not the evidence; the bytes are.
- Releasing when any floor was paid off with words. Floors do not
  disappear; they are recorded in the assessment.
- Releasing from a key that is also a source provider's. The contract
  refuses it; if a UI ever suggests otherwise, do not trust that UI.
