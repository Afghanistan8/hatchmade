// Batching gateway for the Studionet JSON-RPC endpoint (browser twin of
// scripts/lib/rpc-batch.mjs).
//
// The Studionet gateway rate-limits by HTTP request, not by call: a single
// POST carrying a JSON-RPC *batch* of N gen_call requests consumes one slot
// of the anonymous 30/min read bucket (verified live against
// studio.genlayer.com/api: a single gen_call moved x-ratelimit-remaining
// 22 -> 21, and a batch of 3 in one POST moved it 22 -> 21 again, answering
// all three). The SDK's transport never batches by itself, so concurrent
// console reads are merged here.
//
// How it works: window.fetch is wrapped for POSTs to the RPC endpoint only.
// Each gen_call that lands while a flush window is open joins one batched
// POST; every waiter gets back its own single-entry JSON-RPC Response,
// byte-shaped like the gateway's, so the caller's transport parses it
// unchanged. Other traffic passes straight through.
//
// An optional Studio API key (NEXT_PUBLIC_HATCHMADE_STUDIO_API_KEY) is sent
// as the `X-API-Key` header — the same header the Studio web app itself
// attaches when you save a key at studio.genlayer.com/settings, which lifts
// the anonymous read quota. It is an RPC quota key, not wallet material.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function installRpcBatchFetch(rpcUrl: string, opts: { apiKey?: string; flushDelayMs?: number } = {}) {
  const w = globalThis as any;
  if (w.__hatchmadeRpcBatchInstalled || typeof window === "undefined") return;
  w.__hatchmadeRpcBatchInstalled = true;
  const realFetch: typeof fetch = w.fetch.bind(w);
  const apiKey = opts.apiKey || "";
  const flushDelayMs = opts.flushDelayMs ?? 40;
  const canon = String(rpcUrl).replace(/\/+$/, "");

  type Item = {
    id: number;
    method: string;
    params: unknown;
    resolve: (r: { payload: any }) => void;
    reject: (e: Error) => void;
  };
  const queue: Item[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let nextId = 1;

  const flush = async () => {
    flushTimer = null;
    const batch = queue.splice(0);
    if (batch.length === 0) return;
    const entries = batch.map((b) => ({ jsonrpc: "2.0", id: b.id, method: b.method, params: b.params }));
    const body = entries.length === 1 ? entries[0] : entries;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let res: Response;
      try {
        res = await realFetch(canon, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(apiKey ? { "x-api-key": apiKey } : {}),
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        if (attempt === 3) { batch.forEach((b) => b.reject(e as Error)); return; }
        await sleep(4000);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 3) { batch.forEach((b) => b.reject(new Error(`gateway ${res.status}`))); return; }
        const reset = Number(res.headers.get("x-ratelimit-reset") || res.headers.get("retry-after") || 0);
        await sleep(Math.min(Math.max(reset, 5) * 1000, 30000));
        continue;
      }
      let json: any;
      try {
        json = await res.json();
      } catch {
        if (attempt === 3) {
          batch.forEach((b) => b.reject(new Error("RPC answered with a non-JSON body")));
          return;
        }
        await sleep(4000);
        continue;
      }
      const responses = Array.isArray(json) ? json : [json];
      const byId = new Map<number, any>(responses.map((r) => [r.id, r]));
      for (const item of batch) {
        const got = byId.get(item.id);
        if (!got) { item.reject(new Error(`no JSON-RPC response for id ${item.id}`)); continue; }
        item.resolve({ payload: got });
      }
      return;
    }
  };

  w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? "");
    const isRpc =
      url.replace(/\/+$/, "") === canon &&
      (init?.method ?? (input as Request)?.method) === "POST" &&
      init?.body != null;
    if (isRpc) {
      let req: any;
      try {
        req = JSON.parse(String(init!.body));
      } catch { /* not JSON-RPC; pass through */ }
      if (req && typeof req.method === "string") {
        return new Promise<Response>((resolve, reject) => {
          queue.push({
            id: nextId++,
            method: req.method,
            params: req.params,
            resolve: ({ payload }) => {
              const single = payload?.error
                ? { jsonrpc: "2.0", id: payload.id, error: payload.error }
                : { jsonrpc: "2.0", id: payload.id, result: payload.result };
              resolve(new Response(JSON.stringify(single), {
                status: 200,
                headers: { "content-type": "application/json" },
              }));
            },
            reject,
          });
          if (!flushTimer) flushTimer = setTimeout(flush, flushDelayMs);
        });
      }
    }
    return realFetch(input, init);
  };
}

installRpcBatchFetch("https://studio.genlayer.com/api", {
  apiKey: process.env.NEXT_PUBLIC_HATCHMADE_STUDIO_API_KEY || "",
});
