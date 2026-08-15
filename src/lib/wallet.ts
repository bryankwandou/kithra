"use client";

import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { DEVNET_RPC } from "./chain";

/**
 * Minimal wallet binding.
 *
 * The full wallet-adapter stack pulls in a large dependency tree for what this
 * app actually needs: one connect call and one signature, occasionally. Talking
 * to the injected provider directly keeps the bundle small, and every wallet
 * worth supporting exposes this same interface.
 */

type Provider = {
  isPhantom?: boolean;
  publicKey: { toBytes(): Uint8Array } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: unknown }>;
  disconnect(): Promise<void>;
  signAndSendTransaction(tx: Transaction): Promise<{ signature: string }>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
  removeListener?(event: string, cb: (...args: unknown[]) => void): void;
};

function getProvider(): Provider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    phantom?: { solana?: Provider };
    solana?: Provider;
    solflare?: Provider;
  };
  return w.phantom?.solana ?? w.solana ?? w.solflare ?? null;
}

export function useWallet() {
  const [pubkey, setPubkey] = useState<PublicKey | null>(null);
  const [available, setAvailable] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = getProvider();
    setAvailable(Boolean(p));
    if (!p) return;

    // Reconnect silently if this site was already approved.
    p.connect({ onlyIfTrusted: true })
      .then(() => {
        if (p.publicKey) setPubkey(new PublicKey(p.publicKey.toBytes()));
      })
      .catch(() => {
        /* not previously trusted — the user connects manually */
      });

    const onAccountChange = () => {
      const next = getProvider()?.publicKey;
      setPubkey(next ? new PublicKey(next.toBytes()) : null);
    };
    p.on?.("accountChanged", onAccountChange);
    return () => p.removeListener?.("accountChanged", onAccountChange);
  }, []);

  const connect = useCallback(async () => {
    const p = getProvider();
    if (!p) {
      setError("No Solana wallet found. Install Phantom or Solflare.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await p.connect();
      if (p.publicKey) setPubkey(new PublicKey(p.publicKey.toBytes()));
    } catch {
      setError("Connection was declined.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await getProvider()?.disconnect().catch(() => {});
    setPubkey(null);
  }, []);

  const signAndSend = useCallback(async (tx: Transaction) => {
    const p = getProvider();
    if (!p) throw new Error("Wallet went away mid-transaction.");
    const { signature } = await p.signAndSendTransaction(tx);
    return signature;
  }, []);

  return {
    pubkey,
    available,
    connecting,
    error,
    connect,
    disconnect,
    signAndSend,
    setError,
  };
}

let cached: Connection | null = null;
export function connection() {
  if (!cached) cached = new Connection(DEVNET_RPC, "confirmed");
  return cached;
}
