"use client";

import type { ReactNode } from "react";
import { WagmiProvider, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { http, fallback } from "viem";
import { injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import { Toaster } from "sonner";
import "@rainbow-me/rainbowkit/styles.css";

// ---------- Mini-app tespiti ----------
const isMiniApp =
  typeof window !== "undefined" &&
  (/warpcast|farcaster/i.test(window.location.href) ||
    /warpcast/i.test(navigator.userAgent || ""));

// ---------- WalletConnect Project ID ----------
const WC_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  "f4be81876ed5bc310bbc1b67612831c3";

// ---------- RPC fallback (Base mainnet) ----------
const transport = {
  [base.id]: fallback([
    http("https://base-mainnet.g.alchemy.com/v2/R11AN4bze2Uyhg3V6KZ7m"),
    http(
      "https://lb.drpc.live/base/AoBzi9hc10ZYuXKhr5g4Uz-ksgFoq00R8LjmQrxF2MGT"
    ),
  ]),
} as const;

// ---------- Connectors ----------
const connectors = [
  // Farcaster mini-app cüzdanı EIP-1193 injected provider gibi davranır
  injected({
    shimDisconnect: true, // yeniden yüklemede bağlı kalsın
  }),
  walletConnect({
    projectId: WC_PROJECT_ID,
    showQrModal: !isMiniApp, // mini-app içindeyken QR modal gereksiz
    metadata: {
      name: "flooor.fun",
      description: "Royalties for the community",
      url: "https://flooor.fun",
      icons: ["https://flooor.fun/favicon.ico"],
    },
  }),
];

// ---------- wagmi config ----------
const config = createConfig({
  chains: [base],
  connectors,
  transports: transport,
  ssr: true,
});

// ---------- react-query ----------
const queryClient = new QueryClient();

// ---------- RainbowKit custom theme (opsiyonel) ----------
const rkLight = lightTheme({
  accentColor: "#1a1a1a",
  borderRadius: "large",
});
const rkDark = darkTheme({
  accentColor: "#1a1a1a",
  borderRadius: "large",
});

export function Providers(props: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={base}
          theme={{
            lightMode: {
              ...rkLight,
              colors: {
                ...rkLight.colors,
                connectButtonBackground: "#fff",
                connectButtonText: "#1a1a1a",
              },
            },
            darkMode: {
              ...rkDark,
              colors: {
                ...rkDark.colors,
                connectButtonBackground: "#fff",
                connectButtonText: "#1a1a1a",
              },
            },
          }}
          appInfo={{
            appName: "flooor.fun",
            learnMoreUrl: "https://flooor.fun",
          }}
        >
          <Toaster position="top-right" richColors closeButton />
          {props.children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
