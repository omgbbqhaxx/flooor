"use client";

import { base } from "wagmi/chains";
import type { ReactNode } from "react";
import { WagmiProvider, http, fallback } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { Toaster } from "sonner";
import "@rainbow-me/rainbowkit/styles.css";

const rpcTransports = fallback([
  http("https://base-mainnet.g.alchemy.com/v2/R11AN4bze2Uyhg3V6KZ7m"),
  http(
    "https://lb.drpc.live/base/AoBzi9hc10ZYuXKhr5g4Uz-ksgFoq00R8LjmQrxF2MGT"
  ),
]);

const config = getDefaultConfig({
  appName: "flooor.fun",
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
    "f4be81876ed5bc310bbc1b67612831c3",
  chains: [base],
  transports: { [base.id]: rpcTransports },
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers(props: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={{
            lightMode: {
              colors: {
                accentColor: "#1a1a1a",
                accentColorForeground: "#fff",
                actionButtonBorder: "rgba(0, 0, 0, 0.04)",
                actionButtonBorderMobile: "rgba(0, 0, 0, 0.06)",
                actionButtonSecondaryBackground: "rgba(0, 0, 0, 0.06)",
                closeButton: "rgba(60, 66, 66, 0.8)",
                closeButtonBackground: "rgba(0, 0, 0, 0.06)",
                connectButtonBackground: "#fff",
                connectButtonBackgroundError: "#FF494A",
                connectButtonInnerBackground:
                  "linear-gradient(0deg, rgba(0, 0, 0, 0.03), rgba(0, 0, 0, 0.06))",
                connectButtonText: "#1a1a1a",
                connectButtonTextError: "#fff",
                connectionIndicator: "#30E000",
                downloadBottomCardBackground:
                  "linear-gradient(126deg, rgba(209, 213, 218, 0) 9.49%, rgba(171, 171, 171, 0.04) 71.04%), #d1d5da",
                downloadTopCardBackground:
                  "linear-gradient(126deg, rgba(171, 171, 171, 0.2) 9.49%, rgba(209, 213, 218, 0) 71.04%), #d1d5da",
                error: "#FF494A",
                generalBorder: "rgba(0, 0, 0, 0.06)",
                generalBorderDim: "rgba(0, 0, 0, 0.03)",
                menuItemBackground: "rgba(60, 66, 66, 0.1)",
                modalBackdrop: "rgba(0, 0, 0, 0.3)",
                modalBackground: "#d1d5da",
                modalBorder: "transparent",
                modalText: "#1a1a1a",
                modalTextDim: "rgba(60, 66, 66, 0.3)",
                modalTextSecondary: "rgba(60, 66, 66, 0.6)",
                profileAction: "#d1d5da",
                profileActionHover: "rgba(209, 213, 218, 0.7)",
                profileForeground: "rgba(60, 66, 66, 0.06)",
                selectedOptionBorder: "rgba(60, 66, 66, 0.1)",
                standby: "#FFD641",
              },
              fonts: {
                body: 'var(--font-oldschool), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
              },
              radii: {
                actionButton: "9999px",
                connectButton: "9999px",
                menuButton: "9999px",
                modal: "24px",
                modalMobile: "24px",
              },
              shadows: {
                connectButton: "0px 4px 12px rgba(0, 0, 0, 0.1)",
                dialog: "0px 8px 32px rgba(0, 0, 0, 0.08)",
                profileDetailsAction: "0px 2px 6px rgba(37, 41, 46, 0.04)",
                selectedOption: "0px 2px 6px rgba(0, 0, 0, 0.04)",
                selectedWallet: "0px 2px 6px rgba(0, 0, 0, 0.04)",
                walletLogo: "0px 2px 16px rgba(0, 0, 0, 0.16)",
              },
              blurs: {
                modalOverlay: "blur(0px)",
              },
            },
            darkMode: {
              colors: {
                accentColor: "#1a1a1a",
                accentColorForeground: "#fff",
                actionButtonBorder: "rgba(0, 0, 0, 0.04)",
                actionButtonBorderMobile: "rgba(0, 0, 0, 0.06)",
                actionButtonSecondaryBackground: "rgba(0, 0, 0, 0.06)",
                closeButton: "rgba(60, 66, 66, 0.8)",
                closeButtonBackground: "rgba(0, 0, 0, 0.06)",
                connectButtonBackground: "#fff",
                connectButtonBackgroundError: "#FF494A",
                connectButtonInnerBackground:
                  "linear-gradient(0deg, rgba(0, 0, 0, 0.03), rgba(0, 0, 0, 0.06))",
                connectButtonText: "#1a1a1a",
                connectButtonTextError: "#fff",
                connectionIndicator: "#30E000",
                downloadBottomCardBackground:
                  "linear-gradient(126deg, rgba(209, 213, 218, 0) 9.49%, rgba(171, 171, 171, 0.04) 71.04%), #d1d5da",
                downloadTopCardBackground:
                  "linear-gradient(126deg, rgba(171, 171, 171, 0.2) 9.49%, rgba(209, 213, 218, 0) 71.04%), #d1d5da",
                error: "#FF494A",
                generalBorder: "rgba(0, 0, 0, 0.06)",
                generalBorderDim: "rgba(0, 0, 0, 0.03)",
                menuItemBackground: "rgba(60, 66, 66, 0.1)",
                modalBackdrop: "rgba(0, 0, 0, 0.3)",
                modalBackground: "#d1d5da",
                modalBorder: "transparent",
                modalText: "#1a1a1a",
                modalTextDim: "rgba(60, 66, 66, 0.3)",
                modalTextSecondary: "rgba(60, 66, 66, 0.6)",
                profileAction: "#d1d5da",
                profileActionHover: "rgba(209, 213, 218, 0.7)",
                profileForeground: "rgba(60, 66, 66, 0.06)",
                selectedOptionBorder: "rgba(60, 66, 66, 0.1)",
                standby: "#FFD641",
              },
              fonts: {
                body: 'var(--font-oldschool), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
              },
              radii: {
                actionButton: "9999px",
                connectButton: "9999px",
                menuButton: "9999px",
                modal: "24px",
                modalMobile: "24px",
              },
              shadows: {
                connectButton: "0px 4px 12px rgba(0, 0, 0, 0.1)",
                dialog: "0px 8px 32px rgba(0, 0, 0, 0.08)",
                profileDetailsAction: "0px 2px 6px rgba(37, 41, 46, 0.04)",
                selectedOption: "0px 2px 6px rgba(0, 0, 0, 0.04)",
                selectedWallet: "0px 2px 6px rgba(0, 0, 0, 0.04)",
                walletLogo: "0px 2px 16px rgba(0, 0, 0, 0.16)",
              },
              blurs: {
                modalOverlay: "blur(0px)",
              },
            },
          }}
        >
          <Toaster position="top-right" richColors closeButton />
          {props.children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
