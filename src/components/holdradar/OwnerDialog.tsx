"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Crown, Loader2, ShieldCheck, Wallet, PenLine, Info, KeyRound, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getEvmWallet, getSolanaWallet, evmSignMessage, bs58Encode } from "./wallets";
import { useAccount } from "wagmi";
import { useLoginWithAbstract, useAbstractClient } from "@abstract-foundation/agw-react";

/**
 * Treasury-owner login (blueprint §7): server sends a one-time message,
 * owner signs it with their wallet, server recovers the signer and issues a
 * free session ONLY if it equals a treasury address.
 *
 * Abstract signing options:
 *  - AGW (smart-contract wallet) — validated server-side via ERC-1271
 *  - any injected EVM wallet (EOA) — validated via EIP-191 recovery
 */

function AgwSignButton({
  message,
  disabled,
  onSigned,
  onAddress,
}: {
  message: string | null;
  disabled?: boolean;
  onSigned: (signature: string) => void;
  onAddress: (address: string) => void;
}) {
  const { login } = useLoginWithAbstract();
  const { address, isConnected, status } = useAccount();
  const { data: abstractClient } = useAbstractClient();
  const [signing, setSigning] = useState(false);
  const connecting = status === "connecting" || status === "reconnecting";

  async function sign() {
    if (!abstractClient) {
      toast({ title: "کیف‌پول AGW هنوز آماده نیست؛ دوباره تلاش کنید.", variant: "destructive" });
      return;
    }
    if (!message) {
      toast({ title: "چالشی برای امضا موجود نیست.", variant: "destructive" });
      return;
    }
    setSigning(true);
    try {
      const signature = await abstractClient.signMessage({ message });
      onAddress(address ?? "");
      onSigned(signature);
    } catch (e) {
      toast({
        title: "امضای AGW ناموفق بود",
        description: e instanceof Error ? e.message.slice(0, 120) : undefined,
        variant: "destructive",
      });
    } finally {
      setSigning(false);
    }
  }

  if (!isConnected) {
    return (
      <Button
        onClick={() => login()}
        disabled={disabled || connecting}
        variant="outline"
        className="h-10 w-full gap-2 border-emerald-400/25 bg-emerald-400/[0.04] text-xs text-emerald-200 hover:bg-emerald-400/[0.08]"
      >
        <Sparkles className="h-4 w-4" />
        اتصال AGW و امضا
      </Button>
    );
  }

  return (
    <Button
      onClick={sign}
      disabled={disabled || signing}
      variant="outline"
      className="h-10 w-full gap-2 border-emerald-400/25 bg-emerald-400/[0.04] text-xs text-emerald-200 hover:bg-emerald-400/[0.08]"
    >
      {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      امضا با کیف‌پول جهانی
    </Button>
  );
}

type Phase = "form" | "sign" | "verifying" | "done";

export function OwnerDialog({
  open,
  onOpenChange,
  onUnlocked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUnlocked: () => void;
}) {
  const [chain, setChain] = useState<"abstract" | "solana">("abstract");
  const [address, setAddress] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [challenge, setChallenge] = useState<{ message: string; nonce: string } | null>(null);
  const [signature, setSignature] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPhase("form");
    setChallenge(null);
    setSignature("");
    setError(null);
  }

  async function requestChallenge() {
    setError(null);
    try {
      const res = await fetch("/api/owner/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: address.trim(), chain }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "خطا در دریافت چالش.");
        return;
      }
      setChallenge({ message: j.message, nonce: j.nonce });
      setPhase("sign");
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    }
  }

  async function signWithWallet() {
    if (!challenge) return;
    setError(null);
    try {
      if (chain === "solana") {
        const w = getSolanaWallet();
        if (!w) throw new Error("کیف‌پول سولانا (Phantom/Solflare/Backpack) در مرورگر پیدا نشد.");
        await w.connect?.();
        const msgBytes = new TextEncoder().encode(challenge.message);
        const { signature: sigBytes } = await w.signMessage(msgBytes, "utf8");
        setSignature(bs58Encode(new Uint8Array(sigBytes)));
      } else {
        const w = getEvmWallet();
        if (!w) throw new Error("کیف‌پول EVM در مرورگر پیدا نشد.");
        const accounts = (await w.request({ method: "eth_requestAccounts" })) as string[];
        const from = accounts?.[0];
        if (!from) throw new Error("حسابی در کیف‌پول پیدا نشد.");
        const hexSig = await evmSignMessage(w, from, challenge.message);
        setSignature(hexSig);
        if (!address.trim()) setAddress(from);
      }
      toast({ title: "امضا انجام شد", description: "برای تأیید نهایی، «تأیید مالکیت» را بزنید." });
    } catch (e) {
      setError(e instanceof Error ? e.message : "امضا ناموفق بود.");
    }
  }

  async function verify() {
    if (!challenge || !signature.trim()) return;
    setPhase("verifying");
    setError(null);
    try {
      const res = await fetch("/api/owner/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: address.trim(), chain, signature: signature.trim(), nonce: challenge.nonce }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        setPhase("done");
        toast({ title: "خوش آمدید 👑", description: "دسترسی مالک خزانه فعال شد." });
        setTimeout(() => {
          onUnlocked();
          onOpenChange(false);
        }, 800);
      } else {
        setPhase("sign");
        setError(j.error ?? "تأیید امضا ناموفق بود.");
      }
    } catch {
      setPhase("sign");
      setError("ارتباط با سرور برقرار نشد.");
    }
  }

  const busy = phase === "verifying";

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/[0.08] bg-[#0B0E14] p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-white/[0.06] px-6 pt-6 pb-5">
          <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
            <Crown className="h-5 w-5 text-amber-300" />
            ورود مالک خزانه
          </DialogTitle>
          <DialogDescription className="text-xs leading-6 text-zinc-500">
            با امضای یک پیام یک‌بارمصرف با کیف‌پولِ یکی از دو آدرس خزانه، بدون پرداخت وارد شوید. آدرس از سمت مرورگر
            قابل جعل نیست؛ سرور امضا را رمزنگاری‌شده راستی‌آزمایی می‌کند.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5">
          {phase === "form" && (
            <div className="flex flex-col gap-4">
              <Tabs value={chain} onValueChange={(v) => setChain(v as "abstract" | "solana")}>
                <TabsList className="grid w-full grid-cols-2 bg-white/[0.04]">
                  <TabsTrigger value="abstract" className="text-xs">Abstract</TabsTrigger>
                  <TabsTrigger value="solana" className="text-xs">سولانا</TabsTrigger>
                </TabsList>
                <TabsContent value="abstract" className="mt-1" />
                <TabsContent value="solana" className="mt-1" />
              </Tabs>

              <div>
                <label className="mb-1.5 block text-[11px] text-zinc-500">آدرس کیف‌پول خزانه</label>
                <Input
                  dir="ltr"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={chain === "abstract" ? "0x…" : "آدرس سولانا (base58)"}
                  className="h-10 border-white/10 bg-black/30 font-mono text-[11px]"
                />
              </div>

              <Button onClick={requestChallenge} disabled={!address.trim()} className="h-11 w-full gap-2 bg-amber-300/90 text-[#231a06] hover:bg-amber-300">
                <KeyRound className="h-4 w-4" />
                دریافت پیام امضا
              </Button>
            </div>
          )}

          {(phase === "sign" || phase === "verifying" || phase === "done") && challenge && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-white/[0.07] bg-black/25 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <Info className="h-3 w-3" /> پیام برای امضا (یک‌بارمصرف، ۱۰ دقیقه اعتبار)
                </div>
                <pre dir="ltr" className="max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-5 text-zinc-400">{challenge.message}</pre>
              </div>

              {chain === "abstract" && (
                <AgwSignButton
                  message={challenge?.message ?? null}
                  disabled={busy}
                  onSigned={(sig) => {
                    setSignature(sig);
                    toast({ title: "امضای AGW انجام شد", description: "برای تأیید نهایی، «تأیید مالکیت» را بزنید." });
                  }}
                  onAddress={(a) => {
                    if (a) setAddress(a);
                  }}
                />
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button onClick={signWithWallet} disabled={busy} variant="outline" className="h-10 w-full gap-2 border-white/15 bg-white/[0.03] text-xs hover:bg-white/[0.06]">
                  <Wallet className="h-4 w-4" />
                  امضا با کیف‌پول تزریقی
                </Button>
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-white/15 px-3 text-[10px] text-zinc-600">
                  <PenLine className="h-3.5 w-3.5" />
                  یا امضا را دستی پایین بچسبانید
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] text-zinc-500">امضا</label>
                <Input
                  dir="ltr"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder={chain === "abstract" ? "0x… (130 hex chars)" : "امضای base58"}
                  className="h-10 border-white/10 bg-black/30 font-mono text-[11px]"
                />
              </div>

              <Button onClick={verify} disabled={busy || !signature.trim()} className="h-11 w-full gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : phase === "done" ? <ShieldCheck className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                {phase === "done" ? "تأیید شد! در حال ورود…" : "تأیید مالکیت"}
              </Button>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3 text-xs leading-6 text-red-300/90">
              {error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
