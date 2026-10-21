"use client";

// Protocol page: schema, ceilings, and the machine-readable refusal classes,
// read from the deployed contract where possible.

import { useCallback, useEffect, useState } from "react";
import { read } from "@/lib/client";
import { Card, Note, PageHead, Badge, Stat } from "@/components/ui";
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
        <div className="grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-4">
          {limits ? (
            Object.entries(limits).map(([k, v]) => (
              <Stat key={k} label={k.replace("max_", "")} value={String(v)} />
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
              <li key={l.code} className="rounded-lg border border-zinc-800/70 bg-zinc-950/30 px-3.5 py-2.5 transition-colors hover:border-zinc-700/70">
                <span className="font-mono text-rose-300">{l.code}</span>
                <span className="ml-2 text-zinc-300">{l.label}</span>
                {catalog?.[l.code] && (
                  <div className="mt-1 text-[10px] leading-relaxed text-zinc-600">{catalog[l.code]}</div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card title="Dimensions stored in the code" hint="this is the whole vocabulary">
            <div className="space-y-3.5 text-xs">
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
            <div className="space-y-2.5 text-xs">
              <a
                className="block break-all font-mono text-emerald-400 underline decoration-emerald-800 decoration-dotted underline-offset-4 transition-colors hover:text-emerald-300"
                href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`}
                target="_blank" rel="noreferrer"
              >
                explorer · {CONTRACT_ADDRESS}
              </a>
              <a
                className="block break-all font-mono text-emerald-400 underline decoration-emerald-800 decoration-dotted underline-offset-4 transition-colors hover:text-emerald-300"
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
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {(items ?? []).map((i) => <Badge key={i}>{i}</Badge>)}
      </div>
    </div>
  );
}
