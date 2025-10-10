"use client";

import { base } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import type { ReactNode } from "react";
import { WagmiProvider, createConfig, http, fallback } from "wagmi";
import { metaMask, coinbaseWallet, injected } from "wagmi/connectors";

// Multiple RPC providers for better reliability
const rpcTransports = fallback([
  http("https://mainnet.base.org"), // Primary Base RPC
  http("https://base-mainnet.g.alchemy.com/v2/demo"), // Alchemy fallback
  http("https://base.blockpi.network/v1/rpc/public"), // BlockPI fallback
  http("https://base.drpc.org"), // DRPC fallback
]);

const config = createConfig({
  chains: [base],
  connectors: [
    metaMask(),
    injected({ shimDisconnect: true }), // Trust Wallet, Binance Wallet gibi injected cüzdanlar
    coinbaseWallet({ appName: "flooor.fun" }),
  ],
  transports: { [base.id]: rpcTransports },
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
