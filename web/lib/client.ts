"use client";

// The genlayer-js client. Reads always go straight to the Studionet RPC;
// writes need an EIP-1193 wallet provider, which the caller supplies.

import { createClient, chains } from "genlayer-js";
import type { GenLayerClient, GenLayerChain } from "genlayer-js";
import { CONTRACT_ADDRESS } from "./config";
import { unmap } from "./format";

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<any>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
};

export type Client = GenLayerClient<GenLayerChain>;

export function rpcClient(): Client {
  return createClient({ chain: chains.studionet }) as unknown as Client;
}

export function walletClient(provider: Eip1193): Client {
  return createClient({ chain: chains.studionet, provider: provider as never }) as unknown as Client;
}

export async function read<T = any>(
  method: string,
  args: Array<string | number> = [],
): Promise<T> {
  const client = rpcClient();
  const raw = await (client as any).readContract({
    address: CONTRACT_ADDRESS,
    functionName: method,
    args,
    jsonSafeReturn: true,
  });
  return unmap(raw) as T;
}

// write waits the full consensus and resolves the receipt, surfacing a
// contract refusal (bracketed code) when the execution finished with an error.
export async function write(
  provider: Eip1193,
  method: string,
  args: Array<string | number> = [],
  onStatus?: (status: string) => void,
): Promise<{ ok: true; receipt: any } | { ok: false; error: string }> {
  const client = walletClient(provider);
  const hash = await (client as any).writeContract({
    address: CONTRACT_ADDRESS,
    functionName: method,
    args,
    value: 0n,
  });
  onStatus?.(`submitted ${String(hash).slice(0, 10)}…`);
  const receipt = await (client as any).waitForTransactionReceipt({
    hash,
    status: "FINALIZED",
    interval: 4000,
    retries: 240,
  });
  const blob = JSON.stringify(receipt ?? {});
  const refusal = blob.match(/\[(?:[A-Z_]+)\][^"\\]{0,160}/);
  const execution = receipt?.execution_result ?? receipt?.vote ?? "";
  const errored =
    execution === "FINISHED_WITH_ERROR" ||
    execution === "ERROR" ||
    receipt?.result_code === 1 ||
    /exit_code 1/.test(blob);
  if (errored) {
    return {
      ok: false,
      error: refusal ? refusal[0] : "execution finished with an error",
    };
  }
  return { ok: true, receipt };
}
