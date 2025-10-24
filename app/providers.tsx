"use client";

import { base } from "wagmi/chains";
import type { ReactNode } from "react";
import { WagmiProvider, http, fallback, createConfig } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
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

// 1️⃣ RainbowKit default config
const baseConfig = getDefaultConfig({
  appName: "flooor.fun",
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
    "f4be81876ed5bc310bbc1b67612831c3",
  chains: [base],
  transports: { [base.id]: rpcTransports },
  ssr: true,
  appDescription: "Royalties for the community",
  appUrl: "https://flooor.fun",
  appIcon: "https://flooor.fun/favicon.ico",
});

// 2️⃣ Farcaster + WalletConnect birleşik yapı
const config = createConfig({
  ...baseConfig,
  connectors: [farcasterMiniApp(), ...baseConfig.connectors],
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
