"use client";

// Cases list: every case on the gate with its settled outcome and gate
// state, plus the panel that opens a new case (opener = connected wallet).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { read, write } from "@/lib/client";
import { useWallet } from "@/lib/wallet";
import { Card, Gate, Note, PageHead, Outcome, Empty, Badge, inputCls, btnPrimary } from "@/components/ui";
import { ERROR_LEGEND } from "@/lib/config";
import { short, stripCode } from "@/lib/format";

type CaseRow = {
  case_id: string;
  product: string;
  lot: string;
  state: string;
  opener: string;
  settled_outcome: string;
  released: boolean;
  packet_sha256: string;
  created_at: string;
};

export default function CasesPage() {
  const wallet = useWallet();
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openErr, setOpenErr] = useState<{ code: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState("Aero-Puck AP-1150");
  const [lot, setLot] = useState("LOT-9751");

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const page = await read<any>("list_cases", [0, 100]);
      setCases(page.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "rpc unreachable");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openCase = async () => {
    if (!wallet.connected || !wallet.address) {
      wallet.openModal();
      return;
    }
    const on = await wallet.ensureChain();
    if (!on) return;
    setBusy(true);
    setOpenErr(null);
    try {
      const result = await write(
        wallet.connected.provider, "open_case", [product, lot],
        (s) => console.log("open_case:", s),
      );
      if (!result.ok) {
        const { code, text } = stripCode(result.error);
        setOpenErr({ code: code || "EXECUTION", text });
      } else {
        await refresh();
      }
    } catch (e: any) {
      setOpenErr(stripCode(e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHead
        title="Cases"
        sub="One case, one product lot, one gate. The opener freezes a complete packet; assessments settle outcomes; the gate opens only by an independent reviewer."
        back="/"
      />

      <Card
        title="Open a case"
        hint={wallet.address ? `you will be the opener ${short(wallet.address)}` : "connect a wallet to open"}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              product
            </span>
            <input
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              maxLength={120}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              lot label
            </span>
            <input
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              className={`${inputCls} uppercase`}
            />
          </label>
          <button
            onClick={openCase}
            disabled={busy}
            className={`${btnPrimary} h-[38px] px-5`}
          >
            {busy ? "in consensus…" : "Open case"}
          </button>
        </div>
        {openErr && (
          <div className="mt-4">
            <div className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm">
              <span className="font-mono text-rose-300">[{openErr.code}]</span>
              <span className="ml-2 text-rose-200/80">{openErr.text}</span>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              {ERROR_LEGEND.find((l) => l.code === `[${openErr.code}]`)?.label}
            </p>
          </div>
        )}
      </Card>

      {error && <Note>the contract is not answering: {error}</Note>}

      {cases && cases.length === 0 && !error && (
        <Empty>No case has been opened on this contract yet.</Empty>
      )}

      {cases && cases.length > 0 && (
        <div className="space-y-2.5">
          {cases.map((c) => (
            <Link
              key={c.case_id}
              href={`/cases/${c.case_id}`}
              className="group block rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900/70"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-mono text-sm text-emerald-400 transition-colors group-hover:text-emerald-300">
                  {c.case_id}
                </span>
                <span className="text-sm text-zinc-200">{c.product}</span>
                <span className="font-mono text-xs text-zinc-500">{c.lot}</span>
                {c.created_at && (
                  <span className="hidden font-mono text-[10px] text-zinc-600 lg:inline">
                    opened {String(c.created_at).slice(0, 10)}
                  </span>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Badge>{c.state}</Badge>
                  <Outcome value={c.settled_outcome} />
                  <Gate value={c.released ? "RELEASED" : "BLOCKED"} />
                  <span className="font-mono text-[10px] text-zinc-600">
                    opener {short(c.opener, 4)}
                  </span>
                  <span
                    aria-hidden
                    className="text-xs text-zinc-700 transition-colors group-hover:text-zinc-400"
                  >
                    →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
