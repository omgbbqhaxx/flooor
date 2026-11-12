import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CryptoPunks · flooor.fun — Royalties to the community",
  description:
    "Flooor is live on Ethereum mainnet with CryptoPunks. Bid on the floor, sell instantly, and share 5% of every sale as a holder who signs daily. Royalties to the community.",
  alternates: {
    canonical: "https://flooor.fun/ethereum/punks/",
  },
  openGraph: {
    title: "Flooor on Ethereum — the CryptoPunks market is live",
    description: "Royalties to the community. The CryptoPunks market is live on Ethereum mainnet.",
    url: "https://flooor.fun/ethereum/punks/",
    siteName: "Flooor",
    images: [
      {
        url: "https://flooor.fun/og-image.png",
        width: 1200,
        height: 630,
        alt: "Flooor on Ethereum — CryptoPunks",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Flooor on Ethereum — the CryptoPunks market is live",
    description: "Royalties to the community. The CryptoPunks market is live on Ethereum mainnet.",
    images: ["https://flooor.fun/og-image.png"],
  },
};

export default function PunksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
