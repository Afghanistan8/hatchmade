"use client";

// Authorities: hostnames bound to kinds. First binding is the only binding;
// the console shows who holds each host and lets the connected wallet bind
// an unclaimed hostname.

import { useCallback, useEffect, useState } from "react";
import { read, write } from "@/lib/client";
import { useWallet } from "@/lib/wallet";
import { Card, Empty, Note, PageHead, Badge, inputCls, selectCls, btnPrimary } from "@/components/ui";
import { ERROR_LEGEND } from "@/lib/config";
import { sameAccount, short, stripCode } from "@/lib/format";

type Authority = {
  hostname: string;
  kind: string;
  provider: string;
  note: string;
  bound_at: string;
  seq: number;
};

export default function AuthoritiesPage() {
  const wallet = useWallet();
  const [rows, setRows] = useState<Authority[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [host, setHost] = useState("");
  const [kind, setKind] = useState("REGULATOR");
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const page = await read<any>("list_authorities", [0, 100]);
      setRows(page.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "rpc unreachable");
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const bind = async () => {
    if (!wallet.connected || !wallet.address) {
      wallet.openModal();
      return;
    }
    const on = await wallet.ensureChain();
    if (!on) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await write(wallet.connected.provider, "register_authority", [host, kind, note]);
      if (!result.ok) {
        setErr(stripCode(result.error));
      } else {
        setHost(""); setNote("");
        await refresh();
      }
    } catch (e: any) {
      setErr(stripCode(e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHead
        title="Authorities"
        sub="A source is only what its bound authority says it is. Hostnames bind first come, first served, and nothing unbinds them — the packer of a packet cannot wear a regulator badge."
        back="/"
      />

      <Card
        title="Bind an authority"
        hint={wallet.address ? `binding as ${short(wallet.address)}` : "connect a wallet to bind"}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">hostname</span>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="bulletins.example.gov"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className={selectCls}
            >
              <option>REGULATOR</option>
              <option>MANUFACTURER</option>
              <option>LOGISTICS</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={240}
              className={inputCls}
            />
          </label>
          <button
            onClick={bind}
            disabled={busy || !host}
            className={`${btnPrimary} h-[38px] px-5`}
          >
            {busy ? "in consensus…" : "Bind"}
          </button>
        </div>

        {err && (
          <div className="mt-4">
            <div className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm">
              <span className="font-mono text-rose-300">[{err.code}]</span>
              <span className="ml-2 text-rose-200/80">{err.text}</span>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              {ERROR_LEGEND.find((l) => l.code === `[${err.code}]`)?.label}
            </p>
          </div>
        )}
      </Card>

      {error && <Note>the contract is not answering: {error}</Note>}

      {rows && rows.length === 0 && !error && (
        <Empty>No authority has been bound on this contract yet.</Empty>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                {["#", "hostname", "kind", "bound by", "note", "bound at"].map((h) => (
                  <th key={h} className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr
                  key={a.hostname}
                  className="border-b border-zinc-800/60 transition-colors last:border-0 hover:bg-zinc-950/40"
                >
                  <td className="px-4 py-2.5 font-mono tabular-nums text-zinc-600">{a.seq}</td>
                  <td className="px-4 py-2.5 font-mono text-zinc-200">{a.hostname}</td>
                  <td className="px-4 py-2.5"><Badge>{a.kind}</Badge></td>
                  <td className={`px-4 py-2.5 font-mono tabular-nums ${sameAccount(a.provider, wallet.address) ? "text-emerald-400" : "text-zinc-500"}`}>
                    {sameAccount(a.provider, wallet.address)
                      ? "you"
                      : short(a.provider, 4)}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400">{a.note}</td>
                  <td className="px-4 py-2.5 font-mono text-[10px] text-zinc-600">{a.bound_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
