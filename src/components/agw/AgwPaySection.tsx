"use client";

/**
 * AGW payment section for the Abstract chain.
 *
 * Implements the official AGW React flow per docs.abs.xyz:
 *  - useLoginWithAbstract()  → hosted signup/signin modal (email/social/EOA)
 *  - useAbstractClient()     → AbstractClient with sendTransaction/writeContract
 *  - wagmi useAccount/useBalance for address + balances
 *
 * After a transaction is submitted, the hash is handed back to the parent
 * (PaymentDialog) which runs the existing server-side on-chain verification
 * (POST /api/unlock) — identical trust model for every payment method.
 */
import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { useLoginWithAbstract, useAbstractClient } from "@abstract-foundation/agw-react";
import { parseAbi, parseEther, type Address } from "viem";
import { agwChain } from "@/config/chain";
import { Button } from "@/components/ui/button";
import { Loader2, Wallet2, Sparkles, LogOut, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { AssetRequirement } from "@/components/holdradar/types";

interface AgwPaySectionProps {
  /** treasury address on Abstract (mainnet) */
  treasury: string;
  /** selected asset (ETH native or USDC.e erc20) */
  asset: AssetRequirement;
  /** payable amount in asset units (≈ $1.01) or null when price unavailable */
  amount: number | null;
  /** true while the parent is verifying the tx on-chain */
  verifying: boolean;
  /** a tx hash was already produced & filled (by any method) */
  hasHash: boolean;
  /** called with the tx hash right after the wallet returns it */
  onTxSent: (hash: string) => void;
}

export function AgwPaySection({
  treasury,
  asset,
  amount,
  verifying,
  hasHash,
  onTxSent,
}: AgwPaySectionProps) {
  const { login, logout } = useLoginWithAbstract();
  const { address, isConnected, status } = useAccount();
  const { data: abstractClient, isLoading: clientLoading } = useAbstractClient();

  const { data: ethBalance, isLoading: ethLoading } = useBalance({
    address: address as Address | undefined,
    chainId: agwChain.id,
    query: { enabled: !!address },
  });

  const isErc20 = !!asset.contract;
  const { data: tokenBalance, isLoading: tokenLoading } = useBalance({
    address: address as Address | undefined,
    chainId: agwChain.id,
    token: (asset.contract || undefined) as Address | undefined,
    query: { enabled: !!address && isErc20 },
  });

  const [sending, setSending] = useState(false);
  const [sentHash, setSentHash] = useState<string | null>(null);
  const connecting = status === "connecting" || status === "reconnecting";

  useEffect(() => {
    setSentHash(null);
  }, [asset.symbol, address]);

  /** payable amount as bigint in the asset's base units */
  const amountBase = useMemo(() => {
    if (amount == null) return null;
    if (isErc20) return BigInt(Math.round(amount * 10 ** asset.decimals));
    return parseEther(amount.toFixed(6));
  }, [amount, isErc20, asset.decimals]);

  const balance = isErc20 ? tokenBalance : ethBalance;
  const balanceLoading = isErc20 ? tokenLoading : ethLoading;
  const insufficient = !!(balance && amountBase != null && balance.value < amountBase);

  async function payWithAgw() {
    if (!abstractClient || amountBase == null) return;
    setSending(true);
    try {
      let hash: `0x${string}`;
      if (isErc20) {
        // USDC.e — ERC-20 transfer() via the AGW smart account
        hash = await abstractClient.writeContract({
          address: asset.contract as Address,
          abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
          functionName: "transfer",
          args: [treasury as Address, amountBase],
        });
      } else {
        // Native ETH transfer from the AGW smart account
        hash = await abstractClient.sendTransaction({
          to: treasury as Address,
          value: amountBase,
        });
      }
      setSentHash(hash);
      toast({
        title: "تراکنش ارسال شد ✅",
        description: "در حال راستی‌آزمایی روی زنجیرهٔ Abstract…",
      });
      onTxSent(hash);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: "پرداخت AGW ناموفق بود",
        description: msg.includes("user") || msg.includes("reject") || msg.includes("deny")
          ? "امضا در کیف‌پول رد شد."
          : msg.slice(0, 120),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  /* ---------- not connected yet ---------- */
  if (!isConnected) {
    return (
      <div className="hr-card rounded-2xl border-emerald-400/[0.14] bg-emerald-400/[0.03] p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-300" />
          <div className="text-xs font-bold text-zinc-100">کیف‌پول جهانی Abstract (AGW)</div>
        </div>
        <p className="mt-2 text-[11px] leading-6 text-zinc-500">
          روش پیشنهادی: با ایمیل یا گوگل یا هر کیف‌پول EVM، کیف‌پول قراردادی Abstract خود را باز کنید
          و مستقیماً از داخل سایت پرداخت کنید (بدون افزونه).
        </p>
        <Button
          onClick={() => login()}
          disabled={connecting}
          className="mt-3 h-10 w-full gap-2 bg-emerald-400/90 text-[#06231A] hover:bg-emerald-300"
        >
          {connecting || clientLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wallet2 className="h-4 w-4" />
          )}
          {connecting ? "در حال اتصال…" : "اتصال کیف‌پول جهانی Abstract"}
        </Button>
      </div>
    );
  }

  /* ---------- connected ---------- */
  return (
    <div className="hr-card rounded-2xl border-emerald-400/[0.14] bg-emerald-400/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
          <div className="text-xs font-bold text-zinc-100">کیف‌پول جهانی متصل است</div>
        </div>
        <button
          onClick={() => logout()}
          className="inline-flex items-center gap-1 text-[10px] text-zinc-500 transition hover:text-red-300"
          title="قطع اتصال"
        >
          <LogOut className="h-3 w-3" /> قطع
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-lg border border-white/[0.07] bg-black/30 px-2.5 py-2">
          <div className="text-zinc-500">آدرس AGW</div>
          <div dir="ltr" className="mt-1 truncate font-mono text-[10px] text-zinc-300">
            {address}
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.07] bg-black/30 px-2.5 py-2">
          <div className="text-zinc-500">موجودی {asset.symbol}</div>
          <div dir="ltr" className="mt-1 font-mono text-[10px] text-zinc-300">
            {balanceLoading || !balance
              ? "…"
              : `${Number(balance.formatted).toFixed(isErc20 ? 2 : 5)} ${balance.symbol}`}
          </div>
        </div>
      </div>

      {insufficient && (
        <div className="mt-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-1.5 text-[10px] leading-5 text-amber-300/90">
          موجودی {asset.symbol} برای این پرداخت کافی نیست؛ کیف‌پول را شارژ کنید یا روش دیگری انتخاب کنید.
        </div>
      )}

      <Button
        onClick={payWithAgw}
        disabled={sending || verifying || amountBase == null || insufficient || !abstractClient}
        className="mt-3 h-11 w-full gap-2 bg-emerald-400/90 text-[#06231A] hover:bg-emerald-300"
      >
        {sending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : sentHash ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Wallet2 className="h-4 w-4" />
        )}
        {sending
          ? "در انتظار امضای کیف‌پول…"
          : sentHash && !verifying
            ? "ارسال شد ✓ (راستی‌آزمایی کنید)"
            : `پرداخت ${amount != null ? amount.toFixed(isErc20 ? 2 : 6) : "?"} ${asset.symbol} با AGW`}
      </Button>

      {sentHash && (
        <a
          href={`https://abscan.org/tx/${sentHash}`}
          target="_blank"
          rel="noreferrer"
          dir="ltr"
          className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] text-emerald-300/80 hover:text-emerald-300"
        >
          {sentHash.slice(0, 18)}…{sentHash.slice(-8)}
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {hasHash && !sentHash && (
        <div className="mt-2 text-[10px] text-zinc-500">هش تراکنش در فرم پایین ثبت شده است.</div>
      )}

      <p className="mt-3 border-t border-white/[0.06] pt-2 text-[10px] leading-5 text-zinc-600">
        تراکنش مستقیماً از قرارداد هوشمند کیف‌پول شما به خزانهٔ HoldRadar ارسال می‌شود؛ کارمزد شبکه
        (ETH) جدا از مبلغ پرداخت است و سرور رسید را روی زنجیره راستی‌آزمایی می‌کند.
      </p>
    </div>
  );
}
