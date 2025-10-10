"use client";

import { base } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import type { ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { metaMask, coinbaseWallet, injected } from "wagmi/connectors";

const config = createConfig({
  chains: [base],
  connectors: [
    metaMask(),
    injected({ shimDisconnect: true }), // Trust Wallet, Binance Wallet gibi injected cüzdanlar
    coinbaseWallet({ appName: "flooor.fun" }),
  ],
  transports: { [base.id]: http() },
});

export function Providers(props: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <OnchainKitProvider
        apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
        chain={base}
        config={{
          appearance: {
            mode: "auto",
          },
        }}
      >
        {props.children}
      </OnchainKitProvider>
    </WagmiProvider>
  );
}
