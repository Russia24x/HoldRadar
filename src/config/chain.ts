import { abstract, abstractTestnet } from "viem/chains";

/**
 * Chain for the Abstract Global Wallet (AGW) integration.
 *
 * Per docs.abs.xyz/abstract-global-wallet:
 *  - `abstract`       = Abstract Mainnet  (chainId 2741, RPC api.mainnet.abs.xyz)
 *  - `abstractTestnet`= Abstract Testnet  (chainId 11124)
 *
 * HoldRadar payments are verified on Abstract MAINNET (the treasury and the
 * whole payment-verification pipeline are mainnet), so mainnet is the default
 * in every environment. Set NEXT_PUBLIC_AGW_CHAIN=testnet only for isolated
 * wallet-flow experiments (payments will NOT verify there).
 */
export const agwChain =
  process.env.NEXT_PUBLIC_AGW_CHAIN === "testnet" ? abstractTestnet : abstract;

export const AGW_CHAIN_ID = agwChain.id; // 2741 on mainnet
