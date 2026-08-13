import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";

const oldschoolGrotesk = localFont({
  src: [
    {
      path: "./fonts/oldschool-grotesk-font/OldschoolGrotesk-NormalLight.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "./fonts/oldschool-grotesk-font/OldschoolGrotesk-NormalRegular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/oldschool-grotesk-font/OldschoolGrotesk-NormalMedium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/oldschool-grotesk-font/OldschoolGrotesk-NormalBold.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "./fonts/oldschool-grotesk-font/OldschoolGrotesk-NormalExtraBold.otf",
      weight: "800",
      style: "normal",
    },
  ],
  variable: "--font-oldschool",
  display: "swap",
  preload: true,
});
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://flooor.fun"),
  title: "flooor.fun — 5% royalty accumulates in the daily vault — 16-hour sign phase, 8-hour claim phase",
  description:
    "Royalties for the community. Sign with your NFT without staking to participate in daily royalty distribution. NFT marketplace, Base blockchain, VRNouns, daily rewards, DeFi, Web3, cryptocurrency, blockchain rewards, community governance.",
  openGraph: {
    title: "Flooor — The Daily Auction House for Premium NFTs",
    description: "Sign & claim daily Ethereum yield. Royalties to the community.",
    url: "https://flooor.fun",
    siteName: "Flooor",
    images: [
      {
        url: "https://flooor.fun/og-image.png",
        width: 1200,
        height: 630,
        alt: "Flooor — The Daily Auction House for Premium NFTs",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Flooor — The Daily Auction House for Premium NFTs",
    description: "Sign & claim daily Ethereum yield. Royalties to the community.",
    images: ["https://flooor.fun/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      {
        url: "/android-icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    apple: [
      { url: "/apple-icon-57x57.png", sizes: "57x57" },
      { url: "/apple-icon-60x60.png", sizes: "60x60" },
      { url: "/apple-icon-72x72.png", sizes: "72x72" },
      { url: "/apple-icon-76x76.png", sizes: "76x76" },
      { url: "/apple-icon-114x114.png", sizes: "114x114" },
      { url: "/apple-icon-120x120.png", sizes: "120x120" },
      { url: "/apple-icon-144x144.png", sizes: "144x144" },
      { url: "/apple-icon-152x152.png", sizes: "152x152" },
      { url: "/apple-icon-180x180.png", sizes: "180x180" },
    ],
    other: [
      {
        rel: "apple-touch-icon-precomposed",
        url: "/apple-icon-precomposed.png",
      },
    ],
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={oldschoolGrotesk.variable}
      style={{ backgroundColor: "#F7F5F1" }}
    >
      <head>
        <meta name="msapplication-TileColor" content="#1A1A1A" />
        <meta name="msapplication-TileImage" content="/ms-icon-144x144.png" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="theme-color" content="#1A1A1A" />
        <meta name="base:app_id" content="6938998fe6be54f5ed71d4bf" />
        <meta
          name="fc:miniapp"
          content={JSON.stringify({
            version: "next",
            imageUrl: "https://flooor.fun/bg.png",
            button: {
              title: "Open App",
              action: {
                type: "launch_frame",
                url: "https://flooor.fun",
              },
            },
          })}
        />
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-5B3B1SJBNH"
        ></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-5B3B1SJBNH');
            `,
          }}
        />
      </head>
      <body className={`${oldschoolGrotesk.className} bg-background`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
