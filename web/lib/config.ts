// Hatchmade console configuration: one network, one contract, no fallbacks.
// The RPC and chain are pinned to Studionet; the contract address is the one
// recorded in scripts/out/deployment.json at deploy time.

export const RPC_URL = "https://studio.genlayer.com/api";
export const CHAIN_ID = 61999; // decimal
export const CHAIN_ID_HEX = "0xf22f";
export const CHAIN_NAME = "GenLayer Studionet";
export const CURRENCY = { name: "GEN", symbol: "GEN", decimals: 18 };
export const EXPLORER = "https://explorer-studio.genlayer.com";

// Deployed 2026-10-21 (scripts/out/deployment.json). Override with
// NEXT_PUBLIC_HATCHMADE_CONTRACT if the gate is redeployed.
export const CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_HATCHMADE_CONTRACT ||
  "0x7a88389Bd7c340D48Dc1802Ac32Ea6b7E652133B"
) as `0x${string}`;

export const FIXTURE_BASE = "https://github.com/Afghanistan8/hatchmade/tree/main/fixtures";

export const PROTOCOL = {
  rules: "hatchmade-gate-1",
  schema: "hatchmade.evidence-gate@1",
};

// The contract's own refusal classes, mirrored from get_error_catalog().
export const ERROR_LEGEND: Array<{ code: string; label: string }> = [
  { code: "[GATE_RULE]", label: "The gate is not open on this input" },
  { code: "[INVALID_INPUT]", label: "A value does not pass its basic shape check" },
  { code: "[LIMIT]", label: "A value is over the protocol's size ceiling" },
  { code: "[WRONG_STATE]", label: "The record is not in the state this step needs" },
  { code: "[NOT_FOUND]", label: "No such record on this contract" },
  { code: "[UNAUTHORIZED]", label: "The connected account does not hold this role" },
  { code: "[AUTHORITY_TAKEN]", label: "A second claim on an already-bound hostname" },
  { code: "[AUTHORITY_KIND]", label: "The authority kind is not one of the three" },
  { code: "[HOST_UNBOUND]", label: "No authority is bound to a pinned URL's host" },
  { code: "[URL_REJECTED]", label: "The URL is not one this contract fetches" },
  { code: "[DIGEST_MISMATCH]", label: "A pinned digest does not match its bytes" },
  { code: "[INCOMPLETE_PACKET]", label: "The packet is missing a required authority kind" },
  { code: "[NOT_CLEAR]", label: "Reviewer steps exist only after a CLEAR outcome" },
  { code: "[REVIEWER_LOCKED]", label: "An accepted reviewer cannot be replaced" },
  { code: "[ALREADY_RELEASED]", label: "The gate already opened; once, never twice" },
  { code: "[PENDING]", label: "Too many assessments already requested" },
  { code: "[PACKET_MISMATCH]", label: "The request binds a different packet" },
  { code: "[PANEL]", label: "The validator panel did not agree on the record" },
  { code: "[FROZEN_PACKET]", label: "The packet is frozen and can no longer be edited" },
];

export const OUTCOME_TONE: Record<string, string> = {
  NONE: "text-zinc-400 border-zinc-700 bg-zinc-800/60",
  CLEAR: "text-emerald-300 border-emerald-800/60 bg-emerald-950/40",
  REVIEW: "text-amber-300 border-amber-800/60 bg-amber-950/40",
  QUARANTINE: "text-rose-300 border-rose-800/60 bg-rose-950/40",
};

export const GATE_TONE: Record<string, string> = {
  BLOCKED: "text-rose-300 border-rose-800/60 bg-rose-950/40",
  RELEASED: "text-emerald-300 border-emerald-800/60 bg-emerald-950/40",
};
