"use client";

// Overview: what this gate is, what it refuses to be, and the live chain
// state, straight from the deployed contract.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { read } from "@/lib/client";
import { Card, Note, PageHead, Badge, Gate, Outcome, Stat } from "@/components/ui";
import { CONTRACT_ADDRESS, EXPLORER } from "@/lib/config";
import { short } from "@/lib/format";

type ProtocolInfo = {
  rules: string;
  schema: string;
  scope: string;
  network: string;
  provider: string;
  word_run: number;
  counts: { case: number; authority: number; assessment: number };
  limits: Record<string, number>;
  authority_kinds: string[];
  case_states: string[];
  gates: string[];
  outcomes: string[];
  review_readings: string[];
  reviewer_states: string[];
};

export default function Home() {
  const [info, setInfo] = useState<ProtocolInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setInfo(await read<ProtocolInfo>("get_protocol_info"));
    } catch (e: any) {
      setError(e?.message ?? "rpc unreachable");
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="space-y-6">
      <PageHead
        title="Hatchmade"
        sub="An outbound recall / shipment evidence gate. An operator freezes a complete evidence packet — a regulator bulletin, a manufacturer notice, an outbound manifest — as exact pinned bytes. Independent GenLayer validators fetch every source themselves, inspect the lot against the recall, and settle an outcome. The gate stays BLOCKED until an appointed independent reviewer releases it — once."
      />

      {error && (
        <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          The contract is not answering the RPC right now. Some views may fail:
          the chain may be mid-consensus. <span className="text-zinc-400">{error}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Gate contract">
          <div className="space-y-4 text-sm">
            <a
              className="block break-all font-mono text-xs text-emerald-400 underline decoration-emerald-800 decoration-dotted underline-offset-4 transition-colors hover:text-emerald-300"
              href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
            >
              {CONTRACT_ADDRESS}
            </a>
            <div className="grid grid-cols-3 gap-2.5">
              <Stat label="cases" value={info?.counts?.case} />
              <Stat label="frozen" value={info?.counts?.authority} labelRight="authorities" />
              <Stat label="assessments" value={info?.counts?.assessment} />
            </div>
            <div>
              <Badge>{info?.schema ?? "…"}</Badge>
            </div>
          </div>
        </Card>

        <Card title="How an outcome settles">
          <ol className="space-y-3 text-xs leading-relaxed text-zinc-400">
            {[
              ["Freeze", "the packet seals all three authority kinds as pinned bytes with digests. After seal, nothing in it can change."],
              ["Inspect", "validators fetch each source themselves. Live bytes are checked against the pins before anything else is believed."],
              ["Read", "each node reads the regulator bulletin itself; a verdict whose quoted basis is not in the bulletin is held at UNCERTAIN."],
              ["Settle", "the outcome only ever hardens: a case later proves worse, never better."],
              ["Release", "a reviewer who is nobody in the case can open the gate once. Nobody can re-close or reopen it."],
            ].map(([term, text], i) => (
              <li key={term} className="flex gap-3">
                <span className="w-5 shrink-0 pt-px text-right font-mono text-[10px] leading-5 text-emerald-600">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="font-medium text-zinc-100">{term}</span>
                  {" — "}
                  {text}
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="What this is not">
          <Note>
            {info?.scope ??
              "Unknown until the contract answers; this text is written into the deployed code itself."}
          </Note>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Outcomes and states" hint="as stored in the deployed code">
          <div className="space-y-5 text-sm">
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                outcomes
              </div>
              <div className="flex flex-wrap gap-2">
                {["NONE", "CLEAR", "REVIEW", "QUARANTINE"].map((o) => (
                  <Outcome key={o} value={o} />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                gate
              </div>
              <div className="flex gap-2">
                {["BLOCKED", "RELEASED"].map((g) => (
                  <Gate key={g} value={g} />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                authority kinds
              </div>
              <div className="flex flex-wrap gap-2">
                {(info?.authority_kinds ?? []).map((k) => (
                  <Badge key={k}>{k}</Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                case states
              </div>
              <div className="flex flex-wrap gap-2">
                {(info?.case_states ?? []).map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Start where the work is">
          <div className="space-y-2.5 text-sm">
            <LinkRow href="/cases" title="Cases" text="Open a case, freeze its packet, run an assessment, watch gates." />
            <LinkRow href="/authorities" title="Authorities" text="Hostnames bound to authority kinds; first come, never re-bound." />
            <LinkRow href="/verify" title="Verify" text="Recompute packet and decision digests in this browser." />
            <LinkRow href="/protocol" title="Protocol" text="Schema, limits and every refusal the contract can raise." />
          </div>
        </Card>
      </div>

      <Card title="Trust placement" hint="who is trusted with what">
        <div className="grid gap-3 text-xs leading-relaxed text-zinc-400 md:grid-cols-2">
          {[
            ["the packer only documents", <>The operator opens cases and pins bytes. Nothing they write is believed about the recall: validators fetch and read the sources themselves. The packer cannot wear a regulator badge — kinds come from host bindings, held by whoever bound the host first.</>],
            ["the panel only reads", <>Validators fetch, verify, and read. Their agreement is over a decision digest of per-source decisions; a node that sees a different world refuses and the round dies without writing.</>],
            ["the reviewer only opens", <>An independent reviewer — appointed after a CLEAR, and appointed by the case opener, never from the opener&apos;s own address or a source provider&apos;s — can release the gate exactly once.</>],
            ["nobody upgrades", <>No owner, no admin, no pause. Upgrades don&apos;t exist after deploy: fix or replace means a new contract with a new address. No method moves funds of any kind.</>],
          ].map(([head, body], i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-800/70 bg-zinc-950/30 p-3.5 transition-colors hover:border-zinc-700/70"
            >
              <div className="mb-1.5 font-mono text-[11px] text-zinc-300">{head}</div>
              {body}
            </div>
          ))}
        </div>
      </Card>

      <p className="pt-2 text-center font-mono text-[11px] text-zinc-600">
        {short("hatchmade-gate-1", 40)} · word-run grounding {info?.word_run ?? "?"} consecutive words
      </p>
    </div>
  );
}

function LinkRow({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="group block rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-4 py-3 transition-colors hover:border-zinc-700 hover:bg-zinc-900/60"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-zinc-100">{title}</div>
        <span
          aria-hidden
          className="text-xs text-zinc-600 transition-colors group-hover:text-emerald-400"
        >
          →
        </span>
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">{text}</div>
    </Link>
  );
}
