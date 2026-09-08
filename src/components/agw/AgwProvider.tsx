"use client";

/**
 * NextAbstractWalletProvider — App-Router wrapper around
 * `AbstractWalletProvider` from `@abstract-foundation/agw-react`
 * (per docs.abs.xyz/abstract-global-wallet/agw-react/native-integration
 *  and build.abs.xyz/r/agw-provider.json).
 *
 * It internally provides WagmiProvider + QueryClientProvider, so wagmi hooks
 * (useAccount/useBalance/…) and AGW hooks (useAbstractClient,
 * useLoginWithAbstract) become available across the app.
 */
import { AbstractWalletProvider } from "@abstract-foundation/agw-react";
import { QueryClient } from "@tanstack/react-query";
import { agwChain } from "@/config/chain";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function NextAbstractWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AbstractWalletProvider chain={agwChain} queryClient={queryClient}>
      {children}
    </AbstractWalletProvider>
  );
}
