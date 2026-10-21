"use client";

// Small shared presentation atoms.

import Link from "next/link";
import { OUTCOME_TONE, GATE_TONE } from "@/lib/config";
import { ReactNode } from "react";

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
      className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 ${className}`}
    >
      {title && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-200">
            {title}
          </h2>
          {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Outcome({ value }: { value: string | undefined | null }) {
  if (!value) return <Badge>{"—"}</Badge>;
  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 font-mono text-[11px] ${
        (OUTCOME_TONE as any)[value] ?? OUTCOME_TONE.NONE
      }`}
    >
      {value}
    </span>
  );
}

export function Gate({ value }: { value: string | undefined | null }) {
  if (!value) return <Badge>{"—"}</Badge>;
  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 font-mono text-[11px] ${
        (GATE_TONE as any)[value] ?? OUTCOME_TONE.NONE
      }`}
    >
      {value}
    </span>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
      {children}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-sm text-zinc-200 break-words">{children}</div>
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
    <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-xs leading-relaxed text-zinc-400">
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
    <div className="mb-6">
      {back && (
        <Link
          href={back}
          className="mb-2 inline-block text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← back
        </Link>
      )}
      <h1 className="text-xl font-semibold tracking-tight text-zinc-100">{title}</h1>
      {sub && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">{sub}</p>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-10 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}
