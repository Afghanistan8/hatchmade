"use client";

// Public verification: recompute the packet digest and every finalized
// decision digest in this browser (SubtleCrypto), starting from the public
// view data only. The chain must agree, or it is called out.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { read } from "@/lib/client";
import { packetDigest, decisionDigest } from "@/lib/digest";
import { Card, Empty, Note, PageHead, Badge } from "@/components/ui";

type Verdict = {
  assessment_id: string;
  stored: string;
  computed?: string;
  ok?: boolean;
};

export default function VerifyPage() {
  const [cases, setCases] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [packet, setPacket] = useState<any | null>(null);
  const [sheets, setSheets] = useState<any[]>([]);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [packetCheck, setPacketCheck] = useState<{ computed?: string; ok?: boolean } | null>(null);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const page = await read<any>("list_cases", [0, 100]);
        setCases((page.items ?? []).map((c: any) => c.case_id));
      } catch (e: any) {
        setError(e?.message ?? "rpc unreachable");
      }
    })();
  }, []);

  const pick = useCallback(async (cid: string) => {
    setPicked(cid);
    setPacket(null); setSheets([]); setBodies({});
    setPacketCheck(null); setVerdicts([]); setError(null);
    try {
      const p = await read<any>("get_packet", [cid]);
      setPacket(p);
      const s = await read<any>("list_case_assessments", [cid, 0, 100]);
      const list = (s.items ?? []).filter((a: any) => a.status === "FINALIZED");
      setSheets(list);

      const computedPacket = await packetDigest(p.sources ?? []);
      setPacketCheck({ computed: computedPacket, ok: computedPacket === p.packet_sha256 });

      const built: Verdict[] = [];
      for (const a of list) {
        const digest = await decisionDigest(a.decisions ?? []);
        built.push({
          assessment_id: a.assessment_id,
          stored: a.decision_digest,
          computed: digest,
          ok: digest === a.decision_digest,
        });
      }
      setVerdicts(built);
    } catch (e: any) {
      setError(e?.message ?? "verification failed");
    }
  }, []);

  const showBody = async (sid: string) => {
    if (bodies[sid]) return;
    try {
      const body = await read<any>("get_source_body", [sid]);
      setBodies((b) => ({ ...b, [sid]: body?.content ?? "" }));
    } catch { /* view refused */ }
  };

  const allOk =
    packetCheck?.ok !== false &&
    verdicts.length > 0 &&
    verdicts.every((v) => v.ok === true);

  return (
    <div className="space-y-6">
      <PageHead
        title="Verify"
        sub="The digests the protocol hangs on are recomputed here in your browser, from the public record alone: packet rows in pin order, decision rows sorted by source id. If the chain stores anything else, this page says so."
        back="/"
      />

      <Card title="Pick a case">
        {cases.length === 0 ? (
          <Empty><Link className="underline underline-offset-4" href="/cases">Open a case first</Link>.</Empty>
        ) : (
          <div className="flex flex-wrap gap-2">
            {cases.map((cid) => (
              <button
                key={cid}
                onClick={() => pick(cid)}
                className={`rounded-md border px-3 py-1.5 font-mono text-xs ${
                  picked === cid
                    ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
                    : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {cid}
              </button>
            ))}
          </div>
        )}
      </Card>

      {error && <Note>the contract is not answering: {error}</Note>}

      {picked && packet && (
        <Card title={`Case ${picked} — packet`} hint={`packet ${packet.packet_sha256?.slice(0, 16)}…`}>
          <div className="space-y-4">
            <div className={`rounded-lg border px-4 py-3 font-mono text-sm ${
              packetCheck?.ok
                ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300"
                : "border-rose-800/60 bg-rose-950/30 text-rose-300"
            }`}>
              {packetCheck?.computed} {packetCheck?.ok ? "== stored packet digest ✓" : `≠ stored ${packet.packet_sha256}`}
            </div>

            <ul className="space-y-2 text-xs">
              {(packet.sources ?? []).map((s: any) => (
                <li key={s.source_id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-zinc-200">{s.source_id}</span>
                    <Badge>{s.kind}</Badge>
                    <span className="font-mono text-zinc-500">{s.host}</span>
                    <span className="text-zinc-500">{s.url}</span>
                    <span className="ml-auto font-mono text-zinc-400">
                      sha256 {s.pinned_sha256} · {s.byte_len} B
                    </span>
                    <button
                      className="rounded-md border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
                      onClick={() => showBody(s.source_id)}
                    >
                      pinned bytes
                    </button>
                  </div>
                  {bodies[s.source_id] && (
                    <pre className="scroll-thin mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-950 p-2 text-[10px] text-zinc-300">
                      {bodies[s.source_id]}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {picked && sheets.length === 0 && (
        <Note>On {picked} no assessment is FINALIZED yet: once one settles, its
          decision digest is recomputable here independently.</Note>
      )}

      {verdicts.length > 0 && (
        <Card title="Decision digests" hint="recomputed from public rows only">
          <div className="space-y-3">
            {verdicts.map((v) => (
              <div key={v.assessment_id}
                className={`rounded-lg border px-4 py-3 font-mono text-xs ${
                  v.ok
                    ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300"
                    : "border-rose-800/60 bg-rose-950/30 text-rose-300"
                }`}>
                <span className="text-zinc-300">{v.assessment_id}</span>{" "}
                {v.computed} {v.ok ? "== stored ✓" : `≠ stored ${v.stored}`}
              </div>
            ))}
            <p className="pt-1 text-center font-mono text-[11px]">
              {allOk ? (
                <span className="text-emerald-400">every stored digest recomputes from the public record</span>
              ) : (
                <span className="text-rose-400">at least one stored digest does not recompute</span>
              )}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
