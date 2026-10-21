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
          <span className="rounded-md border border-amber-800/60 bg-amber-950/40 px-2 py-1 text-[10px] text-amber-300">
            wrong chain
          </span>
        )}
        {onChain && (
          <span className="hidden rounded-md border border-emerald-800/60 bg-emerald-950/40 px-2 py-1 text-[10px] text-emerald-300 sm:inline">
            studionet
          </span>
        )}
        <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-300">
          {short(address)}
        </span>
        <button
          onClick={disconnect}
          className="rounded-md border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          leave
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={openModal}
      className="rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
    >
      {wallets.length > 0 ? "Connect wallet" : (typeof window !== "undefined" && (window as any).ethereum) ? "Connect wallet" : "Install a wallet"}
    </button>
  );
}

export default function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 antialiased">
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold tracking-tight text-emerald-400">
              hatchmade
            </span>
            <span className="font-mono text-[10px] text-zinc-600">
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
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <ConnectButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="border-t border-zinc-900 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 text-[11px] text-zinc-600">
          <span>
            Hatchmade — frozen evidence, independent inspection, reviewer-only
            release. Studionet chain {CHAIN_ID} ({CHAIN_ID_HEX}).
          </span>
          <span className="font-mono">not a safety opinion · not legal advice</span>
        </div>
      </footer>
      <ModalHost />
    </div>
  );
}
