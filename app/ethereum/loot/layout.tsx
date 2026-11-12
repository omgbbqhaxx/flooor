import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Loot · flooor.fun — Royalties to the community",
  description:
    "Flooor is live on Ethereum mainnet with Loot. Bid on the floor, sell instantly, and share 5% of every sale as a holder who signs daily. Royalties to the community.",
  alternates: {
    canonical: "https://flooor.fun/ethereum/loot/",
  },
  openGraph: {
    title: "Flooor on Ethereum — the Loot market is live",
    description: "Royalties to the community. The Loot market is live on Ethereum mainnet.",
    url: "https://flooor.fun/ethereum/loot/",
    siteName: "Flooor",
    images: [
      {
        url: "https://flooor.fun/og-image.png",
        width: 1200,
        height: 630,
        alt: "Flooor on Ethereum — Loot",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Flooor on Ethereum — the Loot market is live",
    description: "Royalties to the community. The Loot market is live on Ethereum mainnet.",
    images: ["https://flooor.fun/og-image.png"],
  },
};

export default function LootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
