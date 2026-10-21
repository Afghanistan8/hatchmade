"use client";

// Authorities: hostnames bound to kinds. First binding is the only binding;
// the console shows who holds each host and lets the connected wallet bind
// an unclaimed hostname.

import { useCallback, useEffect, useState } from "react";
import { read, write } from "@/lib/client";
import { useWallet } from "@/lib/wallet";
import { Card, Empty, Note, PageHead, Badge } from "@/components/ui";
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
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">hostname</span>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="bulletins.example.gov"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-emerald-700 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 focus:border-emerald-700 focus:outline-none"
            >
              <option>REGULATOR</option>
              <option>MANUFACTURER</option>
              <option>LOGISTICS</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={240}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 focus:border-emerald-700 focus:outline-none"
            />
          </label>
          <button
            onClick={bind}
            disabled={busy || !host}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
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
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/70 text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-2.5">#</th>
                <th className="px-4 py-2.5">hostname</th>
                <th className="px-4 py-2.5">kind</th>
                <th className="px-4 py-2.5">bound by</th>
                <th className="px-4 py-2.5">note</th>
                <th className="px-4 py-2.5">bound at</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.hostname} className="border-b border-zinc-900">
                  <td className="px-4 py-2.5 font-mono text-zinc-500">{a.seq}</td>
                  <td className="px-4 py-2.5 font-mono text-zinc-200">{a.hostname}</td>
                  <td className="px-4 py-2.5"><Badge>{a.kind}</Badge></td>
                  <td className="px-4 py-2.5 font-mono text-zinc-400">
                    {sameAccount(a.provider, wallet.address)
                      ? "you"
                      : short(a.provider, 4)}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400">{a.note}</td>
                  <td className="px-4 py-2.5 font-mono text-zinc-600">{a.bound_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
