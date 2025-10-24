"use client";

import { base } from "wagmi/chains";
import type { ReactNode } from "react";
import { WagmiProvider, http, fallback, createConfig } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  connectorsForWallets,
} from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  phantomWallet,
  baseAccount,
} from "@rainbow-me/rainbowkit/wallets";

import { Toaster } from "sonner";
import "@rainbow-me/rainbowkit/styles.css";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { sdk } from "@farcaster/miniapp-sdk";

const rpcTransports = fallback([
  http("https://base-mainnet.g.alchemy.com/v2/R11AN4bze2Uyhg3V6KZ7m"),
  http(
    "https://lb.drpc.live/base/AoBzi9hc10ZYuXKhr5g4Uz-ksgFoq00R8LjmQrxF2MGT"
  ),
]);

// 1️⃣ Project ID
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  "f4be81876ed5bc310bbc1b67612831c3";

// 2️⃣ Wallet connectors
const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular",
      wallets: [
        metaMaskWallet,
        walletConnectWallet,
        baseAccount,
        phantomWallet,
      ],
    },
  ],
  {
    appName: "flooor.fun",
    projectId,
  }
);

// 3️⃣ Wagmi config
const config = createConfig({
  chains: [base],
  connectors: [...connectors, farcasterMiniApp()],
  transports: { [base.id]: rpcTransports },
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  // ✅ Farcaster splash screen kapatma
  if (typeof window !== "undefined") {
    sdk?.actions?.ready?.();
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={base}
          appInfo={{
            appName: "flooor.fun",
            learnMoreUrl: "https://flooor.fun",
          }}
        >
          <Toaster position="top-right" richColors closeButton />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
