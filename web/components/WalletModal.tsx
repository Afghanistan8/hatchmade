"use client";

// The wallet connect modal: every EIP-6963 announced wallet, then the
// window.ethereum fallback. The user chooses; the console never assumes.

import { useWallet } from "@/lib/wallet";

export default function WalletModal() {
  const {
    modalOpen,
    setModalOpen,
    wallets,
    connect,
    connectFallback,
    connecting,
    connectError,
  } = useWallet();

  if (!modalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Connect a wallet"
      onClick={() => setModalOpen(false)}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-800/90 bg-zinc-950 p-5 shadow-2xl shadow-black/60 ring-1 ring-inset ring-white/[0.03]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">
            Choose a wallet
          </h2>
          <button
            className="rounded-md px-2 py-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            onClick={() => setModalOpen(false)}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          Detected wallets are listed here. Nothing is assumed: pick the one
          you unlocked.
        </p>

        <div className="mt-4 space-y-2">
          {wallets.map((w) => (
            <button
              key={w.rdns}
              disabled={connecting}
              onClick={() => connect(w)}
              className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5
                         text-left text-sm text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-800
                         disabled:opacity-50"
            >
              {w.info.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.info.icon} alt="" className="h-6 w-6 rounded" />
              ) : (
                <span className="grid h-6 w-6 place-items-center rounded bg-zinc-800 text-xs">
                  ◈
                </span>
              )}
              <span className="flex-1">{w.info.name}</span>
              <span className="font-mono text-[10px] text-zinc-600">{w.rdns}</span>
            </button>
          ))}

          {wallets.length === 0 && (
            <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-xs text-zinc-500">
              No EIP-6963 wallets announced yet. If OKX or MetaMask is
              installed, click below to use the browser-injected provider.
            </p>
          )}

          <button
            disabled={connecting}
            onClick={connectFallback}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/70 px-3 py-2.5 text-sm text-zinc-300
                       transition-colors hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50"
          >
            Use injected wallet (window.ethereum)
          </button>
        </div>

        {connectError && (
          <p className="mt-3 rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
            {connectError}
          </p>
        )}
        {connecting && (
          <p className="mt-3 text-center font-mono text-xs text-zinc-500">connecting…</p>
        )}
      </div>
    </div>
  );
}
