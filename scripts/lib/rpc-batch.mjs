// scripts/lib/rpc-batch.mjs
//
// Batching gateway for the Studionet JSON-RPC endpoint.
//
// The Studionet gateway rate-limits by HTTP request, not by call: a single
// POST carrying a JSON-RPC *batch* of N gen_call requests consumes one slot
// of the anonymous read bucket (verified live against studio.genlayer.com/api:
// a single gen_call moved x-ratelimit-remaining 22 -> 21, and a batch of 3 in
// one POST moved it 22 -> 21 again, answering all three). The gateway answers
// arrays, which the SDK's own transport never produces by itself, so
// concurrent SDK reads are merged here.
//
// How it works: globalThis.fetch is wrapped for POSTs to the RPC endpoint
// only. Each gen_call that lands while a flush window is open joins one
// batched POST; every waiter gets back its own single-entry JSON-RPC
// Response, byte-shaped like the gateway's, so callers (viem transport,
// genlayer-js pipelines) parse them unchanged. Non-gen_call RPC traffic and
// non-RPC URLs pass straight through.
//
// Also carries the Studio API key when one is provided. The Studio web app
// itself attaches the key from studio.genlayer.com/settings as the HTTP
// header `X-API-Key` (verified in the app bundle: settingsStore.apiKey) on
// every request, and its settings page states that without a key the
// anonymous rate limits apply. The key lifts the RPC read quota; it is not
// wallet material and is optional.
//
// Usage:
//   installRpcBatchFetch("https://studio.genlayer.com/api", { apiKey });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function installRpcBatchFetch(rpcUrl, { apiKey = "", flushDelayMs = 60, verbose = false } = {}) {
  if (globalThis.__hatchmadeRpcBatchInstalled) return;
  globalThis.__hatchmadeRpcBatchInstalled = true;
  const realFetch = globalThis.fetch;
  const canon = String(rpcUrl).replace(/\/+$/, "");
  const log = (...a) => { if (verbose) console.log("[rpc-batch]", ...a); };

  let queue = [];
  let flushTimer = null;
  let nextId = 1;

  const flush = async () => {
    flushTimer = null;
    const batch = queue.splice(0);
    if (batch.length === 0) return;
    log(batch.length === 1 ? "single call" : `batched ${batch.length} gen_calls into one POST`);

    // One HTTP request carries every queued call when there is more than one.
    const entries = batch.map((b) => ({ jsonrpc: "2.0", id: b.id, method: b.method, params: b.params }));
    const body = entries.length === 1 ? entries[0] : entries;

    for (let attempt = 1; attempt <= 4; attempt++) {
      let res;
      try {
        const headers = { "content-type": "application/json" };
        if (apiKey) headers["x-api-key"] = apiKey;
        res = await realFetch(canon, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
      } catch (e) {
        if (attempt === 4) { batch.forEach((b) => b.reject(e)); return; }
        log(`network error (${e.message || e}); waiting 15s (attempt ${attempt}/4)`);
        await sleep(15000);
        continue;
      }
      if (res.status === 429) {
        const reset = Number(res.headers.get("x-ratelimit-reset") || res.headers.get("retry-after") || 0);
        const wait = Math.min(Math.max(reset, 5) * 1000, 65000);
        if (attempt === 4) {
          batch.forEach((b) => b.reject(new Error("rate limited on every retry")));
          return;
        }
        log(`429; waiting ${wait / 1000}s (attempt ${attempt}/4)`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 500) {
        if (attempt === 4) {
          batch.forEach((b) => b.reject(new Error(`gateway ${res.status}`)));
          return;
        }
        log(`gateway ${res.status}; waiting 15s (attempt ${attempt}/4)`);
        await sleep(15000);
        continue;
      }

      // Some outages serve HTML with a 200; a JSON parse failure retries.
      let json;
      try {
        json = JSON.parse(await res.text());
      } catch {
        if (attempt === 4) {
          batch.forEach((b) => b.reject(new Error("RPC answered with a non-JSON body")));
          return;
        }
        log("non-JSON body; waiting 15s (attempt " + attempt + "/4)");
        await sleep(15000);
        continue;
      }

      const responses = Array.isArray(json) ? json : [json];
      const byId = new Map(responses.map((r) => [r.id, r]));
      for (const item of batch) {
        const got = byId.get(item.id);
        if (!got) {
          item.reject(new Error(`no JSON-RPC response for id ${item.id}`));
          continue;
        }
        // Shape each answer exactly like a single-entry response so the
        // caller's transport parses it unchanged.
        item.resolve({
          status: res.status,
          payload: got,
          id: item.id,
        });
      }
      return;
    }
  };

  globalThis.fetch = async (input, init) => {
    // Optional quota key rides along on every request, like the Studio app.
    if (apiKey) {
      const passthrough = { ...init, headers: { ...(init?.headers || {}) } };
      const lower = Object.keys(passthrough.headers).find(
        (k) => k.toLowerCase() === "x-api-key");
      if (!lower) passthrough.headers["x-api-key"] = apiKey;
      init = passthrough;
    }

    // Only single JSON-RPC gen_call POSTs to the exact endpoint are queued;
    // everything else (receipt polls, chain probes, other hosts) passes
    // through untouched.
    const url = String(typeof input === "string" ? input : (input && input.url) || "");
    const isRpc = url.replace(/\/+$/, "") === canon;
    if (isRpc && init?.method?.toUpperCase() === "POST" && init?.body) {
      let req;
      try {
        req = JSON.parse(String(init.body));
      } catch { return realFetch(input, init); }
      if (req && req.method === "gen_call") {
        return new Promise((resolve, reject) => {
          queue.push({
            id: nextId++,
            method: req.method,
            params: req.params,
            resolve: ({ payload }) => {
              const single = payload.error
                ? { jsonrpc: "2.0", id: payload.id, error: payload.error }
                : { jsonrpc: "2.0", id: payload.id, result: payload.result };
              resolve(new Response(JSON.stringify(single), {
                status: 200,
                statusText: "OK",
                headers: { "content-type": "application/json" },
              }));
            },
            reject: (e) => reject(e),
          });
          if (!flushTimer) flushTimer = setTimeout(flush, flushDelayMs);
        });
      }
    }
    return realFetch(input, init);
  };
}
