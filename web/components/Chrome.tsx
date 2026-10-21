"use client";

// Header + navigation + connect button, present on every page.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import ModalHost from "@/components/WalletModal";
import { CHAIN_ID, CHAIN_ID_HEX } from "@/lib/config";
import { short } from "@/lib/format";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/cases", label: "Cases" },
  { href: "/authorities", label: "Authorities" },
  { href: "/verify", label: "Verify" },
  { href: "/protocol", label: "Protocol" },
];

function ConnectButton() {
  const { address, chainId, openModal, disconnect, wallets } = useWallet();
  const onChain = Number.parseInt(chainId ?? "0", 16) === CHAIN_ID;

  if (address) {
    return (
      <div className="flex items-center gap-2">
        {!onChain && (
          <span className="inline-flex items-center rounded-full border border-amber-800/60 bg-amber-950/40 px-2 py-0.5 font-mono text-[10px] text-amber-300">
            wrong chain
          </span>
        )}
        {onChain && (
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-800/60 bg-emerald-950/40 px-2 py-0.5 font-mono text-[10px] text-emerald-300 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            studionet
          </span>
        )}
        <span className="rounded-lg border border-zinc-700/80 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs tabular-nums text-zinc-200">
          {short(address)}
        </span>
        <button
          onClick={disconnect}
          className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200"
        >
          leave
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={openModal}
      className="inline-flex items-center rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 active:bg-emerald-700"
    >
      {wallets.length > 0 || (typeof window !== "undefined" && (window as any).ethereum)
        ? "Connect wallet"
        : "Install a wallet"}
    </button>
  );
}

export default function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="relative flex min-h-dvh flex-col bg-zinc-950 text-zinc-100">
      {/* faint brand glow behind the header */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_60%_100%_at_50%_-20%,rgba(16,185,129,0.08),transparent_70%)]"
      />

      <header className="sticky top-0 z-40 border-b border-zinc-800/70 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:h-14 sm:py-0">
          <Link href="/" className="flex shrink-0 items-baseline gap-2">
            <span className="font-mono text-[13px] font-semibold tracking-tight text-emerald-400">
              hatchmade
            </span>
            <span className="hidden font-mono text-[10px] text-zinc-600 sm:inline">
              hatchmade-gate-1
            </span>
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                    active
                      ? "bg-zinc-800/90 text-zinc-50"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex shrink-0 items-center">
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>

      <footer className="border-t border-zinc-900 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 text-[11px] text-zinc-600">
          <span>
            Hatchmade — frozen evidence, independent inspection, reviewer-only
            release. Studionet chain {CHAIN_ID} ({CHAIN_ID_HEX}).
          </span>
          <span className="font-mono text-zinc-700">
            not a safety opinion · not legal advice
          </span>
        </div>
      </footer>

      <ModalHost />
    </div>
  );
}
