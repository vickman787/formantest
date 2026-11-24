"use client";

import { useCallback, useEffect, useState } from "react";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

const QIE_CHAIN_HEX = "0x7c6";

export default function WalletButton() {
  const [address, setAddress] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const check = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[];
      if (accounts?.[0]) {
        setAddress(accounts[0]);
        const r = await fetch("/api/auth/me").then((x) => x.json()).catch(() => ({}));
        setSignedIn(r.wallet?.toLowerCase() === accounts[0].toLowerCase());
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  async function connectAndSign() {
    setError("");
    if (!window.ethereum) {
      setError("No wallet found. Install a browser wallet (e.g. MetaMask) and try again.");
      return;
    }
    setBusy(true);
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const wallet = accounts[0];
      setAddress(wallet);
      const chainId = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      if (chainId.toLowerCase() !== QIE_CHAIN_HEX) {
        try {
          await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: QIE_CHAIN_HEX }] });
        } catch {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: QIE_CHAIN_HEX, chainName: "QIE Mainnet", nativeCurrency: { name: "QIE", symbol: "QIE", decimals: 18 }, rpcUrls: ["https://rpc1mainnet.qie.digital"], blockExplorerUrls: ["https://mainnet.qie.digital"] }],
          });
        }
      }
      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      const { nonce, message, error: nonceErr } = await nonceRes.json();
      if (!nonceRes.ok) throw new Error(nonceErr ?? "Could not start sign-in.");
      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [message, wallet],
      })) as string;
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, nonce, signature }),
      });
      const v = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(v.error ?? "Signature did not verify.");
      setSignedIn(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  if (address && signedIn) {
    return (
      <span className="pill" title={address}>
        ● Signed in · {address.slice(0, 6)}…{address.slice(-4)}
      </span>
    );
  }
  return (
    <span>
      <button className="btn light" onClick={connectAndSign} disabled={busy} type="button">
        {busy ? "Waiting for wallet…" : address ? "Sign in with wallet" : "Connect wallet ↗"}
      </button>
      {error && <span style={{ display: "block", fontSize: 12, color: "#a33", marginTop: 6 }}>{error}</span>}
    </span>
  );
}
