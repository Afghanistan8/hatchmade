"use client";

// Wallet wiring with EIP-6963 multi-wallet discovery ("always verify, do not
// assume"). Every announced provider -- OKX, MetaMask, Rabby, ... -- is
// listed in the connect modal; if none announces, the modal falls back to
// window.ethereum. After connecting, the Studionet chain is verified and
// switched/added as needed.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CHAIN_ID_HEX, CHAIN_NAME, CURRENCY, EXPLORER, RPC_URL } from "./config";
import type { ReactNode } from "react";

export type ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

export type WalletEntry = {
  info: ProviderInfo;
  provider: any;
  rdns: string;
};

type WalletState = {
  wallets: WalletEntry[];
  address: string | null;
  connected: WalletEntry | null;
  chainId: string | null;
  connecting: boolean;
  connectError: string | null;
  openModal: () => void;
  disconnect: () => void;
  ensureChain: () => Promise<boolean>;
};

const Ctx = createContext<WalletState | null>(null);

const STUDIONET = {
  chainId: CHAIN_ID_HEX,
  chainName: CHAIN_NAME,
  nativeCurrency: CURRENCY,
  rpcUrls: [RPC_URL],
  blockExplorerUrls: [EXPLORER],
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [connected, setConnected] = useState<WalletEntry | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const fallbackRef = useRef<any>(null);

  // -- discovery -------------------------------------------------------------
  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.info || !detail?.provider) return;
      setWallets((current) => {
        if (current.some((w) => w.rdns === detail.info.rdns)) return current;
        return [
          ...current,
          { info: detail.info, provider: detail.provider, rdns: detail.info.rdns },
        ];
      });
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    // keep listening: extensions can announce late (after load)
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);

  const setFromProvider = useCallback(async (entry: WalletEntry) => {
    const accounts: string[] = await entry.provider.request({
      method: "eth_accounts",
    });
    if (!accounts?.length) return false;
    const chain: string = await entry.provider.request({ method: "eth_chainId" });
    setAddress(accounts[0]);
    setChainId(chain);
    setConnected(entry);
    return true;
  }, []);

  const ensureChain = useCallback(async (): Promise<boolean> => {
    if (!connected) return false;
    const current: string = await connected.provider.request({
      method: "eth_chainId",
    });
    setChainId(current);
    if (Number.parseInt(current, 16) === 61999) return true;
    try {
      await connected.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch (error: any) {
      if (error?.code === 4902 || /unrecognized|not add/i.test(error?.message ?? "")) {
        await connected.provider.request({
          method: "wallet_addEthereumChain",
          params: [STUDIONET],
        });
      } else {
        setConnectError(
          "the wallet refused to switch to GenLayer Studionet (chain 61999)",
        );
        return false;
      }
    }
    const after: string = await connected.provider.request({ method: "eth_chainId" });
    setChainId(after);
    return Number.parseInt(after, 16) === 61999;
  }, [connected]);

  const connect = useCallback(
    async (entry: WalletEntry) => {
      setConnecting(true);
      setConnectError(null);
      try {
        await entry.provider.request({ method: "eth_requestAccounts" });
        const got = await setFromProvider(entry);
        if (got) {
          setModalOpen(false);
          await ensureChain();
        } else {
          setConnectError("the wallet returned no account; unlock it and retry");
        }
      } catch (error: any) {
        setConnectError(error?.message ?? "connection refused by the wallet");
      } finally {
        setConnecting(false);
      }
    },
    [ensureChain, setFromProvider],
  );

  // -- reconnect on mount to any provider that already holds an account ------
  useEffect(() => {
    (async () => {
      const candidates = wallets.length
        ? wallets
        : fallbackRef.current
          ? [{ provider: fallbackRef.current, info: { rdns: "fallback" } as any }]
          : [];
      for (const entry of candidates) {
        try {
          const accounts: string[] = await entry.provider.request({
            method: "eth_accounts",
          });
          if (accounts?.length) {
            await setFromProvider(entry as WalletEntry);
            break;
          }
        } catch {
          /* wallet not ready; the user connects manually */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets.length]);

  useEffect(() => {
    if (!connected) return;
    const onAccounts = (accounts: string[]) => {
      if (!accounts?.length) {
        setConnected(null);
        setAddress(null);
      } else {
        setAddress(accounts[0]);
      }
    };
    const onChain = (chain: string) => setChainId(chain);
    connected.provider.on?.("accountsChanged", onAccounts);
    connected.provider.on?.("chainChanged", onChain);
    return () => {
      connected.provider.removeListener?.("accountsChanged", onAccounts);
      connected.provider.removeListener?.("chainChanged", onChain);
    };
  }, [connected]);

  const fallbackProvider = useCallback((): WalletEntry | null => {
    if (typeof window === "undefined") return null;
    const eth = (window as any).ethereum;
    if (!eth) return null;
    fallbackRef.current = eth;
    return {
      provider: eth,
      info: {
        uuid: "fallback",
        name: (eth.isMetaMask ? "MetaMask" : "Browser wallet") + (eth.isOKExWallet ? " (OKX)" : ""),
        icon: "",
        rdns: "window.ethereum",
      },
      rdns: "window.ethereum",
    };
  }, []);

  const connectFallback = useCallback(async () => {
    const entry = fallbackProvider();
    if (!entry) return;
    await connect(entry);
  }, [connect, fallbackProvider]);

  const value = useMemo<WalletState>(
    () => ({
      wallets,
      address,
      connected,
      chainId,
      connecting,
      connectError,
      openModal: () => setModalOpen(true),
      disconnect: () => {
        setConnected(null);
        setAddress(null);
        setConnectError(null);
      },
      ensureChain,
    }),
    [wallets, address, connected, chainId, connecting, connectError, ensureChain],
  );

  return (
    <Ctx.Provider value={{ ...value, wallets, connect: connect as any, connectFallback, modalOpen, setModalOpen } as any}>
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletState & {
  connect: (entry: WalletEntry) => Promise<void>;
  connectFallback: () => Promise<void>;
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
} {
  const ctx = useContext(Ctx) as any;
  if (!ctx) throw new Error("useWallet outside provider");
  return ctx;
}
