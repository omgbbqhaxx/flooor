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
  title: "Flooor FUN",
  description:
    "Royalties for the community. Sign with your NFT to participate in daily royalty distribution. NFT marketplace, Base blockchain, VRNouns, daily rewards, DeFi, Web3, cryptocurrency, blockchain rewards, NFT staking, community governance.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={oldschoolGrotesk.variable}>
      <head>
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
      <body className={`${oldschoolGrotesk.className} bg-background dark`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
