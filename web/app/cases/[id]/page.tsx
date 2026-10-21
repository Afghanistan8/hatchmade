"use client";

// Case console: the whole life of one gate. Freeze, assess, appoint, release
// — each step's authority is checked against the connected wallet, and every
// refusal the contract raises is shown with its legend entry.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { read, write } from "@/lib/client";
import { useWallet } from "@/lib/wallet";
import {
  Card, Gate, Note, PageHead, Outcome, Badge, Field,
} from "@/components/ui";
import { ERROR_LEGEND } from "@/lib/config";
import { isTrue, sameAccount, short, stripCode, truncate } from "@/lib/format";
import { packetDigest, decisionDigest } from "@/lib/digest";

type Case_ = any;
type Packet = { packet_sha256: string; sealed: boolean; sources: any[]; injection_flags: any[] };
type Assessment = any;

export default function CaseConsole() {
  const params = useParams<{ id: string }>();
  const caseId = String(params.id ?? "").toUpperCase();
  const wallet = useWallet();

  const [c, setCase] = useState<Case_ | null>(null);
  const [packet, setPacket] = useState<Packet | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [bodies, setBodies] = useState<Record<string, { content: string; sha256: string }>>({});
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [err, setErr] = useState<{ code: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [recomputed, setRecomputed] = useState<{ packet?: string; ok?: boolean; loading?: boolean }>({});

  // pin form
  const [pinUrl, setPinUrl] = useState("");
  const [pinBody, setPinBody] = useState("");
  // reviewer address form
  const [reviewerInput, setReviewerInput] = useState("");
  const [releaseNote, setReleaseNote] = useState("");

  const refresh = useCallback(async () => {
    if (!caseId) return;
    try {
      setLoadErr(null);
      const caseData = await read<any>("get_case", [caseId]);
      setCase(caseData);
      if (isTrue(caseData?.sealed) || caseData?.state === "FROZEN" || caseData?.state === "SETTLED") {
        setPacket(await read<Packet>("get_packet", [caseId]));
      }
      const sheets = await read<any>("list_case_assessments", [caseId, 0, 50]);
      setAssessments(sheets.items ?? []);
      const hist = await read<any>("get_history", [caseId, 0, 50]);
      setHistory(hist.items ?? []);
    } catch (e: any) {
      const { code, text } = stripCode(e?.message ?? String(e));
      setLoadErr(code ? `[${code}] ${text}` : (e?.message ?? "rpc unreachable"));
    }
  }, [caseId]);

  useEffect(() => { refresh(); }, [refresh]);

  const loadBody = async (sid: string) => {
    if (bodies[sid]) return bodies[sid];
    try {
      const body = await read<any>("get_source_body", [sid]);
      const next = { ...bodies, [sid]: body };
      setBodies(next);
      return body;
    } catch {
      return null;
    }
  };

  const act = async (method: string, args: Array<string | number>, after?: () => void) => {
    if (!wallet.connected || !wallet.address) {
      setErr({ code: "WALLET", text: "connect a wallet first" });
      wallet.openModal();
      return;
    }
    const on = await wallet.ensureChain();
    if (!on) return;
    setBusy(method);
    setErr(null);
    try {
      const result = await write(wallet.connected.provider, method, args);
      if (!result.ok) {
        setErr(stripCode(result.error));
      } else {
        await refresh();
        after?.();
      }
    } catch (e: any) {
      setErr(stripCode(e?.message ?? String(e)));
    } finally {
      setBusy(null);
    }
  };

  const recomputePacket = async () => {
    if (!packet) return;
    setRecomputed({ loading: true });
    const digest = await packetDigest(packet.sources ?? []);
    setRecomputed({ packet: digest, ok: digest === packet.packet_sha256 });
  };

  if (loadErr) {
    return (
      <div className="space-y-6">
        <PageHead title={`Case ${caseId}`} back="/cases" />
        <div className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4 py-3 font-mono text-sm text-rose-300">
          {loadErr}
        </div>
        {loadErr.includes("NOT_FOUND") && (
          <Note>No case is registered under this id. {" "}<Link className="underline underline-offset-4" href="/cases" >Back to cases</Link>.</Note>
        )}
      </div>
    );
  }

  if (!c) {
    return <p className="py-16 text-center font-mono text-sm text-zinc-500">reading the chain…</p>;
  }

  const user = wallet.address;
  const isOpener = sameAccount(user, c.opener);
  const isReviewer = sameAccount(user, c.reviewer);
  const open = c.state === "OPEN";
  const frozen = c.state === "FROZEN";
  const settled = c.state === "SETTLED";
  const clear = c.settled_outcome === "CLEAR";
  const reviewerState = c.reviewer_state ?? "NONE";

  return (
    <div className="space-y-6">
      <PageHead
        title={`Case ${c.case_id}`}
        sub={`${c.product} · lot ${c.lot}`}
        back="/cases"
      />

      {/* gate + identity row */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="The gate" hint={`case ${c.state.toLowerCase()}`}>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">state</div>
              <div className="mt-1"><Gate value={c.released ? "RELEASED" : "BLOCKED"} /></div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">settled outcome</div>
              <div className="mt-1"><Outcome value={c.settled_outcome} /></div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">reviewer</div>
              <div className="mt-1 font-mono text-sm text-zinc-300">
                {c.reviewer ? short(c.reviewer) : "not appointed"}
              </div>
            </div>
          </div>

          {(c.blocked_reasons ?? [])?.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
              {(c.blocked_reasons as string[]).map((r, i) => (
                <li key={i}>· {r}</li>
              ))}
            </ul>
          )}
          {c.released && (
            <div className="mt-4 border-t border-zinc-800 pt-3">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">release note</div>
              <p className="mt-1 text-sm text-zinc-200">{c.release_note}</p>
              {c.released_at && (
                <p className="mt-1 font-mono text-[10px] text-zinc-500">{c.released_at}</p>
              )}
            </div>
          )}
        </Card>

        <Card title="Roles" hint="role isolation is enforced on chain">
          <div className="space-y-3 text-sm">
            <Field label={isOpener ? "opener — you" : "opener"}>{short(c.opener)}</Field>
            <Field label={isReviewer ? "reviewer — you" : "reviewer"}>
              {c.reviewer ? short(c.reviewer) : "none"}
            </Field>
            <Field label="reviewer state"><Badge>{reviewerState}</Badge></Field>
          </div>
        </Card>
      </div>

      {err && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${err.code === "EXECUTION" || err.code === "WALLET" ? "border-amber-900/60 bg-amber-950/30 text-amber-300" : "border-rose-900/60 bg-rose-950/30 text-rose-300"}`}>
          <span className="font-mono">[{err.code}]</span>
          <span className="ml-2 opacity-80">{err.text}</span>
          {ERROR_LEGEND.find((l) => l.code === `[${err.code}]`) && (
            <div className="mt-1 text-[11px] text-zinc-400">
              {ERROR_LEGEND.find((l) => l.code === `[${err.code}]`)?.label}
            </div>
          )}
        </div>
      )}

      {/* freeze panel */}
      <Card
        title="Evidence packet"
        hint={
          !packet
            ? "not frozen yet"
            : isTrue(packet.sealed)
              ? `${(packet.sources ?? []).length} sources frozen`
              : "still assembling"
        }
      >
        {packet ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge>packet sha256</Badge>
              <span className="break-all font-mono text-xs text-zinc-300">{packet.packet_sha256}</span>
              {recomputed.packet && (
                <span className={`font-mono text-[11px] ${recomputed.ok ? "text-emerald-400" : "text-rose-400"}`}>
                  {recomputed.loading ? "…" : recomputed.ok ? "recomputed: matches" : `recomputed: ${recomputed.packet} MISMATCH`}
                </span>
              )}
              <button
                onClick={recomputePacket}
                className="ml-auto rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                recompute in browser
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="py-2 pr-3">source</th>
                    <th className="py-2 pr-3">kind</th>
                    <th className="py-2 pr-3">host</th>
                    <th className="py-2 pr-3">pinned sha256</th>
                    <th className="py-2 pr-3">bytes</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(packet.sources ?? []).map((s: any) => (
                    <SourceRow key={s.source_id} s={s} loadBody={loadBody} />
                  ))}
                </tbody>
              </table>
            </div>

            {(packet.injection_flags ?? []).length > 0 && (
              <Note>
                <b className="text-amber-300">injection signals recorded at seal:</b>{" "}
                {(packet.injection_flags as any[]).map((f) => f.signal ?? String(f)).join(", ")}. None of
                these can clear a decision; they only harden toward review.
              </Note>
            )}
          </div>
        ) : (
          <Note>
            The packet is still being assembled by
            {" "}{short(c.opener)}. Its kinds (regulator / manufacturer / logistics) must all be present
            before the freeze. Sources are pinned as exact bytes and digests.
          </Note>
        )}

        {/* opener actions while assembling */}
        {open && isOpener && (
          <div className="mt-5 space-y-3 border-t border-zinc-800 pt-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              opener actions — pin a source, then freeze
            </div>
            <div className="grid gap-3">
              <input
                value={pinUrl}
                onChange={(e) => setPinUrl(e.target.value)}
                placeholder="https://… (host must be a bound authority)"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-emerald-700 focus:outline-none"
              />
              <textarea
                value={pinBody}
                onChange={(e) => setPinBody(e.target.value)}
                rows={4}
                placeholder="the exact bytes of the source document"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-emerald-700 focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => act("pin_source", [c.case_id, pinUrl, pinBody], () => {
                    setPinUrl(""); setPinBody("");
                  })}
                  disabled={busy !== null || !pinUrl || !pinBody}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                >
                  {busy === "pin_source" ? "in consensus…" : "Pin source"}
                </button>
                <button
                  onClick={() => act("seal_packet", [c.case_id])}
                  disabled={busy !== null}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy === "seal_packet" ? "in consensus…" : "Freeze packet (seal)"}
                </button>
              </div>
            </div>

            {/* unpin from the assembled-but-unsealed packet */}
            {(c.source_ids ?? [])?.length > 0 && open && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                sources pinned: {(c.source_ids as string[]).join(", ")}
              </div>
            )}
          </div>
        )}

        {(frozen || settled) && isOpener && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
            <button
              onClick={() => act("request_assessment", [c.case_id])}
              disabled={busy !== null}
              className="rounded-lg bg-sky-700 px-4 py-2 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {busy === "request_assessment" ? "in consensus…" : "Request assessment"}
            </button>
            <span className="self-center text-[11px] text-zinc-500">
              binds this packet; any account may then execute it
            </span>
          </div>
        )}
      </Card>

      {/* assessments */}
      <Card title="Assessments" hint={`${(c.assessment_ids ?? [])?.length ?? 0} requested on this case`}>
        {assessments.length === 0 ? (
          <Note>No assessment requested yet. An assessment is a full re-inspection:
            validators fetch every pinned source and read the regulator bulletins themselves.</Note>
        ) : (
          <div className="space-y-4">
            {assessments.map((a) => (
              <AssessmentBlock
                key={a.assessment_id}
                case_id={c.case_id}
                a={a}
                onExecute={() => act("execute_assessment", [a.assessment_id])}
                busy={busy}
                loadBody={loadBody}
              />
            ))}
          </div>
        )}
      </Card>

      {/* reviewer panel */}
      <Card title="Independent reviewer" hint="appointed on a CLEAR, by the opener; never from the opener">
        {c.released ? (
          <Note>The gate has been released by an independent reviewer. A release is
            permanent; no further appointment or release is possible.</Note>
        ) : !settled ? (
          <Note>Reviewer appointments become possible once the case settles,
            and only on a CLEAR outcome.</Note>
        ) : !clear ? (
          <Note>
            The settled outcome is <Outcome value={c.settled_outcome} /> — not CLEAR,
            so the reviewer path stays closed. A further assessment may settle better
            outcomes, but settling only ever hardens.
          </Note>
        ) : reviewerState === "ACCEPTED" && isReviewer ? (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">
              You accepted the appointment for this case. Reading the packet and the
              live sources yourself is your work; the gate is one signature away.
            </p>
            <textarea
              value={releaseNote}
              onChange={(e) => setReleaseNote(e.target.value)}
              rows={2}
              placeholder="release note (e.g. the basis you checked) — optional"
              maxLength={400}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-emerald-700 focus:outline-none"
            />
            <button
              onClick={() => act("release_gate", [c.case_id, releaseNote], () => setReleaseNote(""))}
              disabled={busy !== null}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === "release_gate" ? "in consensus…" : "Release gate"}
            </button>
          </div>
        ) : reviewerState === "ACCEPTED" ? (
          <Note>The reviewer {short(c.reviewer)} has accepted and may release the gate.</Note>
        ) : reviewerState === "PROPOSED" ? (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">
              Proposed reviewer: <span className="font-mono">{short(c.reviewer)}</span>.
              Proposed at {c.reviewer_proposed_at}.
            </p>
            {isReviewer ? (
              <button
                onClick={() => act("accept_reviewer", [c.case_id])}
                disabled={busy !== null}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy === "accept_reviewer" ? "in consensus…" : "Accept appointment"}
              </button>
            ) : (
              <Note>Only the proposed address can accept. Nobody else can.</Note>
            )}
          </div>
        ) : isOpener ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
                propose a reviewer address
              </span>
              <input
                value={reviewerInput}
                onChange={(e) => setReviewerInput(e.target.value)}
                placeholder="0x… (must be someone else)"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-emerald-700 focus:outline-none"
              />
            </label>
            <button
              onClick={() => act("propose_reviewer", [c.case_id, reviewerInput], () => setReviewerInput(""))}
              disabled={busy !== null || !reviewerInput}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              {busy === "propose_reviewer" ? "in consensus…" : "Propose"}
            </button>
          </div>
        ) : (
          <Note>The opener must appoint a reviewer. The appointment is refused for the
            opener itself and for every provider whose authority holds a pinned host.</Note>
        )}
      </Card>

      {/* history */}
      <Card title="History" hint="written on chain as the case moved">
        <ol className="space-y-2 text-xs">
          {history.map((h: any) => (
            <li key={h.seq} className="flex flex-wrap items-baseline gap-x-3 border-b border-zinc-900 pb-2">
              <span className="font-mono text-zinc-600">{h.seq}</span>
              <span className="font-mono text-emerald-400/90">{h.action}</span>
              <span className="text-zinc-400">{truncate(String(h.detail ?? ""), 110)}</span>
              <span className="ml-auto font-mono text-zinc-600">{short(h.by, 4)}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function SourceRow({
  s, loadBody,
}: {
  s: any;
  loadBody: (sid: string) => Promise<any>;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<{ content: string; sha256: string } | null>(null);

  const toggle = async () => {
    const next = body ?? (await loadBody(s.source_id));
    setBody(next);
    setOpen((v) => !v);
  };

  return (
    <>
      <tr className="border-b border-zinc-900">
        <td className="py-2 pr-3 font-mono text-zinc-200">{s.source_id}</td>
        <td className="py-2 pr-3"><Badge>{s.kind}</Badge></td>
        <td className="py-2 pr-3 font-mono text-zinc-400">{s.host}</td>
        <td className="py-2 pr-3 font-mono text-zinc-400">{s.pinned_sha256?.slice(0, 18)}…</td>
        <td className="py-2 pr-3 font-mono text-zinc-400">{s.byte_len}</td>
        <td className="py-2 text-right">
          <button
            className="rounded-md border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
            onClick={toggle}
          >
            {open ? "hide" : "bytes"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="pb-3">
            <pre className="scroll-thin max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-[10px] leading-relaxed text-zinc-300">
              {body?.content ?? "could not read the pinned body"}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function AssessmentBlock({
  case_id, a, onExecute, busy, loadBody,
}: {
  case_id: string;
  a: Assessment;
  onExecute?: () => void;
  busy: string | null;
  loadBody: (sid: string) => Promise<any>;
}) {
  const finalized = a.status === "FINALIZED";
  const requested = a.status === "REQUESTED";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-sky-400">{a.assessment_id}</span>
        <Badge>{a.status}</Badge>
        {finalized && <Outcome value={a.outcome} />}
        <span className="ml-auto font-mono text-[10px] text-zinc-600">
          requested by {short(a.requested_by, 4)}
        </span>
        {requested && onExecute && (
          <button
            onClick={onExecute}
            disabled={busy !== null}
            className="rounded-lg bg-sky-700 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {busy === "execute_assessment" ? "in consensus…" : "Execute (any account)"}
          </button>
        )}
      </div>

      {finalized && (
        <div className="mt-3 space-y-3 border-t border-zinc-800 pt-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <Badge>decision digest</Badge>
            <RecomputeDigest a={a} />
          </div>

          {(a.floors ?? []).length > 0 && (
            <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-200">
              <div className="mb-1 font-mono uppercase tracking-wider text-amber-300">floors</div>
              <ul className="space-y-0.5">
                {(a.floors as any[]).map((f, i) => (
                  <li key={i} className="font-mono">{f.floor}{f.detail ? ` — ${f.detail}` : ""}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="py-1.5 pr-3">source</th>
                  <th className="py-1.5 pr-3">fetched</th>
                  <th className="py-1.5 pr-3">digest</th>
                  <th className="py-1.5 pr-3">reader said</th>
                  <th className="py-1.5 pr-3">held</th>
                  <th className="py-1.5">effective</th>
                </tr>
              </thead>
              <tbody>
                {(a.decisions ?? []).map((d: any) => (
                  <tr key={d.source_id} className="border-b border-zinc-900">
                    <td className="py-1.5 pr-3 font-mono text-zinc-300">{d.source_id}</td>
                    <td className="py-1.5 pr-3">{isTrue(d.fetch_ok) ? "✓" : "✕"}</td>
                    <td className="py-1.5 pr-3">{isTrue(d.digest_match) ? "✓" : "✕"}</td>
                    <td className="py-1.5 pr-3 font-mono text-zinc-300">{d.result}</td>
                    <td className="py-1.5 pr-3">{isTrue(d.held) ? <span className="text-amber-400">held</span> : "—"}</td>
                    <td className="py-1.5 font-mono text-zinc-200">{d.effective}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(a.judgments ?? []).length > 0 && (
            <details className="text-[11px] text-zinc-400">
              <summary className="cursor-pointer select-none hover:text-zinc-300">
                why each reading was accepted or held
              </summary>
              <ul className="mt-2 space-y-2">
                {(a.judgments as any[]).map((j: any, i: number) => (
                  <li key={i} className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
                    <span className="font-mono text-zinc-300">{j.source_id}</span>
                    {" · "}
                    <span className="font-mono">{j.result}</span>
                    {isTrue(j.held) && <span className="ml-2 text-amber-400">held to UNCERTAIN</span>}
                    <div className="mt-1 text-zinc-500">basis: {truncate(String(j.basis ?? ""), 240)}</div>
                    {j.note && <div className="mt-0.5 text-zinc-600">note: {truncate(String(j.note), 160)}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {(a.receipts ?? []).length > 0 && (
            <details className="text-[11px] text-zinc-400">
              <summary className="cursor-pointer select-none hover:text-zinc-300">
                fetch receipts (status, live bytes, digests)
              </summary>
              <ul className="mt-2 space-y-2">
                {(a.receipts as any[]).map((r: any, i: number) => (
                  <li key={i} className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono">
                    <div className="text-zinc-300">
                      {r.source_id} · http {r.status} · live {r.live_len} B
                      {isTrue(r.digest_match) ? " · digest ✓" : " · digest ✕"}
                    </div>
                    <div className="mt-1 text-zinc-600">
                      live sha256: {r.live_sha256 || "—"}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function RecomputeDigest({ a }: { a: Assessment }) {
  const [state, setState] = useState<{ digest?: string; ok?: boolean } | null>(null);

  useEffect(() => {
    if (a.status !== "FINALIZED") return;
    (async () => {
      const digest = await decisionDigest(a.decisions ?? []);
      setState({ digest, ok: digest === a.decision_digest });
    })().catch(() => setState({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.assessment_id, a.status]);

  if (state?.ok === undefined) {
    return <span className="break-all font-mono text-zinc-400">{a.decision_digest}</span>;
  }
  return (
    <span className={`font-mono ${state.ok ? "text-emerald-400" : "text-rose-400"}`}>
      {a.decision_digest}
      {state.ok ? " ✓ recomputed" : ` ✕ recomputed ${state.digest}`}
    </span>
  );
}
