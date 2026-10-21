"use client";

// Small shared presentation atoms, plus the class strings that keep
// inputs and buttons identical across pages.

import Link from "next/link";
import { OUTCOME_TONE, GATE_TONE } from "@/lib/config";
import { ReactNode } from "react";

/* Shared class strings — one vocabulary for every page. */

export const inputCls =
  "w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-xs text-zinc-100 " +
  "placeholder:text-zinc-600 transition-colors focus:border-emerald-700 focus:outline-none";

export const selectCls =
  "w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-100 " +
  "transition-colors focus:border-emerald-700 focus:outline-none";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs " +
  "font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 active:bg-emerald-700 " +
  "disabled:pointer-events-none disabled:opacity-50";

export const btnAccent =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-xs " +
  "font-medium text-white shadow-sm transition-colors hover:bg-sky-600 " +
  "disabled:pointer-events-none disabled:opacity-50";

export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-900/60 " +
  "px-4 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 " +
  "disabled:pointer-events-none disabled:opacity-40";

export const btnChip =
  "rounded-md border border-zinc-700/80 px-2 py-0.5 text-[10px] text-zinc-300 transition-colors " +
  "hover:border-zinc-600 hover:bg-zinc-800";

/* Micro label used for both column headers and inline labels. */
export const microCls =
  "font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500";

export function Card({
  title,
  hint,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] ${className}`}
    >
      {title && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">
            {title}
          </h2>
          {hint && <span className="text-[11px] text-zinc-600">{hint}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

const PILL = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono tracking-wide";
const DOT = "h-1.5 w-1.5 shrink-0 rounded-full bg-current";

export function Outcome({
  value,
  large,
}: {
  value: string | undefined | null;
  large?: boolean;
}) {
  if (!value) return <Badge>{"—"}</Badge>;
  return (
    <span
      className={`${PILL} ${
        (OUTCOME_TONE as any)[value] ?? OUTCOME_TONE.NONE
      } ${large ? "text-xs" : "text-[11px]"}`}
    >
      <span className={DOT} />
      {value}
    </span>
  );
}

export function Gate({
  value,
  large,
}: {
  value: string | undefined | null;
  large?: boolean;
}) {
  if (!value) return <Badge>{"—"}</Badge>;
  return (
    <span
      className={`${PILL} ${
        (GATE_TONE as any)[value] ?? OUTCOME_TONE.NONE
      } ${large ? "text-xs" : "text-[11px]"}`}
    >
      <span className={DOT} />
      {value}
    </span>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-700/70 bg-zinc-800/40 px-2.5 py-0.5 font-mono text-[10px] text-zinc-300">
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  labelRight,
}: {
  label: string;
  value?: number | string;
  labelRight?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3.5 py-3">
      <div className="font-mono text-2xl leading-none tabular-nums text-zinc-50">
        {value ?? "—"}
      </div>
      <div className={`mt-2 ${microCls}`}>
        {labelRight ?? label}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className={microCls}>{label}</div>
      <div className="mt-1 break-words font-mono text-sm text-zinc-200">{children}</div>
    </div>
  );
}

export function Refusal({ code, text }: { code: string; text?: string }) {
  return (
    <div className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-sm">
      <span className="font-mono text-rose-300">[{code}]</span>
      {text && <span className="ml-2 text-rose-200/80">{text}</span>}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-4 py-3 text-xs leading-relaxed text-zinc-400">
      {children}
    </p>
  );
}

export function PageHead({
  title,
  sub,
  back,
}: {
  title: string;
  sub?: string;
  back?: string;
}) {
  return (
    <div className="mb-8">
      {back && (
        <Link
          href={back}
          className="ml-0.5 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <span aria-hidden>←</span> back
        </Link>
      )}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">{title}</h1>
      {sub && (
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{sub}</p>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/30 px-6 py-12 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}
