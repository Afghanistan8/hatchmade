"use client";

// Protocol page: schema, ceilings, and the machine-readable refusal classes,
// read from the deployed contract where possible.

import { useCallback, useEffect, useState } from "react";
import { read } from "@/lib/client";
import { Card, Note, PageHead, Badge } from "@/components/ui";
import { ERROR_LEGEND, EXPLORER, CONTRACT_ADDRESS } from "@/lib/config";

export default function ProtocolPage() {
  const [info, setInfo] = useState<any | null>(null);
  const [catalog, setCatalog] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setInfo(await read<any>("get_protocol_info"));
      setCatalog(await read<Record<string, string>>("get_error_catalog"));
    } catch (e: any) {
      setError(e?.message ?? "rpc unreachable");
    }
  }, []);

  useEffect(() => { refresh(); const t = setInterval(refresh, 20000); return () => clearInterval(t); }, [refresh]);

  const limits = info?.limits ?? null;

  return (
    <div className="space-y-6">
      <PageHead
        title="Protocol"
        sub={`Rules ${info?.rules ?? "hatchmade-gate-1"} · schema ${info?.schema ?? "hatchmade.evidence-gate@1"} · pinned runner py-genlayer (not an alias). Addressed at ${CONTRACT_ADDRESS}.`}
        back="/"
      />

      {error && <Note>live values unavailable: {error}</Note>}

      <Card title="Ceilings" hint="enforced on chain, per record">
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {limits ? (
            Object.entries(limits).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                <div className="font-mono text-base text-zinc-100">{String(v)}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">{k.replace("max_", "")}</div>
              </div>
            ))
          ) : (
            <span className="col-span-4 text-zinc-500">…</span>
          )}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Refusal classes" hint="the contract never patches its failure text">
          <ul className="space-y-2 text-xs">
            {ERROR_LEGEND.map((l) => (
              <li key={l.code} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <span className="font-mono text-rose-300">{l.code}</span>
                <span className="ml-2 text-zinc-300">{l.label}</span>
                {catalog?.[l.code] && (
                  <div className="mt-1 text-[10px] text-zinc-500">{catalog[l.code]}</div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card title="Dimensions stored in the code" hint="this is the whole vocabulary">
            <div className="space-y-3 text-xs">
              <Vocab label="outcomes" items={info?.outcomes} />
              <Vocab label="gate" items={info?.gates} />
              <Vocab label="authority kinds" items={info?.authority_kinds} />
              <Vocab label="case states" items={info?.case_states} />
              <Vocab label="reviewer states" items={info?.reviewer_states} />
              <Vocab label="review readings" items={info?.review_readings} />
            </div>
          </Card>

          <Card title="Grounding rule">
            <Note>
              A decisive reading is grounded only if its quoted basis carries a
              run of {info?.word_run ?? 6} consecutive words that literally occurs
              in the corresponding bulletin. Everything else is held at UNCERTAIN
              — including confident clearances. Uncertainty always fails closed.
            </Note>
          </Card>

          <Card title="Where to look">
            <div className="space-y-2 text-xs">
              <a
                className="block font-mono text-emerald-400 hover:underline"
                href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`}
                target="_blank" rel="noreferrer"
              >
                explorer · {CONTRACT_ADDRESS}
              </a>
              <a
                className="block font-mono text-emerald-400 hover:underline"
                href="https://github.com/Afghanistan8/hatchmade"
                target="_blank" rel="noreferrer"
              >
                source · github.com/Afghanistan8/hatchmade
              </a>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Vocab({ label, items }: { label: string; items?: string[] }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {(items ?? []).map((i) => <Badge key={i}>{i}</Badge>)}
      </div>
    </div>
  );
}
