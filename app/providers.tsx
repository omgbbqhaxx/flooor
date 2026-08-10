"use client";

import { base } from "wagmi/chains";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { WagmiProvider, http, fallback, createConfig } from "wagmi";
import { reconnect } from "wagmi/actions";
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
import { Attribution } from "ox/erc8021";

const DATA_SUFFIX = Attribution.toDataSuffix({
  codes: ["bc_uzb9vqpt"],
});

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
  // Aynı anda fırlayan eth_call'ları tek Multicall3 çağrısında toplar —
  // RPC compute unit tüketimini ve 429 burst'lerini ciddi azaltır
  batch: { multicall: { wait: 16 } },
  dataSuffix: DATA_SUFFIX,
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  // Farcaster/Base mini-app splash ekranını kapat. Render sırasında değil,
  // içerik gerçekten BOYANDIKTAN sonra çağırıyoruz — erken çağrılırsa host
  // splash'i kaldırır ama native WebView'lar CSS/font yüklenene kadar
  // varsayılan olarak SİYAH gösterdiği için bu, (yavaş bağlantıda uzayabilen)
  // bir siyah ekran olarak görünür. Sadece 2 rAF beklemek CSS/font'un fiilen
  // uygulandığını garanti etmiyor; bu yüzden font yüklenmesini de bekliyoruz
  // — yine de sonsuza kadar takılı kalmasın diye 3sn'lik bir üst sınır var.
  useEffect(() => {
    let cancelled = false;
    const callReady = () => {
      if (cancelled) return;
      cancelled = true;
      clearTimeout(fallbackTimer);
      try {
        sdk?.actions?.ready?.();
      } catch {
        // mini-app bağlamı dışında (normal web) — sorun değil
      }
    };
    (async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      try {
        if (typeof document !== "undefined" && "fonts" in document) {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 1500)),
          ]);
        }
      } catch {
        // font durumu okunamadı — yine de devam et
      }
      // fonts.ready resolve olması, tarayıcının o fontu bir frame'e fiilen
      // BOYADIĞI anlamına gelmez — aradaki gecikme cihaza/ağa göre değişir
      // ve bazı açılışlarda host splash'i kapatırken içerik hâlâ boyanmamış
      // olabilir. Bir frame daha bekleyip garantiye alıyoruz.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      callReady();
    })();
    const fallbackTimer = setTimeout(callReady, 3000);
    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
    };
  }, []);

  // <WagmiProvider>'ın varsayılan reconnectOnMount'u TÜM bağlayıcıları
  // (storage'da kayıtlı olan her connector'ı) sessizce reconnect etmeye
  // çalışır — bu yüzden normal masaüstü tarayıcıda MetaMask'e zaten bağlıyken
  // farcasterMiniApp connector'ı da eth_accounts ister ve miniapp SDK
  // köprüsü üzerinden istenmeyen bir Base App bağlanma denemesi/popup'ı
  // tetikler. Bunu kapatıp reconnect'i kendimiz kontrollü şekilde yapıyoruz:
  // gerçekten bir mini-app içinde değilsek farcasterMiniApp'i hariç tutuyoruz.
  useEffect(() => {
    (async () => {
      let isMiniApp = false;
      try {
        isMiniApp = await sdk.isInMiniApp();
      } catch {
        isMiniApp = false;
      }
      const connectorsToReconnect = isMiniApp
        ? config.connectors
        : config.connectors.filter((c) => c.type !== farcasterMiniApp.type);
      try {
        await reconnect(config, { connectors: connectorsToReconnect });
      } catch {
        // reconnect denemesi başarısız olsa da uygulamayı bloklamaz
      }
    })();
  }, []);

  return (
    <WagmiProvider config={config} reconnectOnMount={false}>
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
