import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Milady Maker · flooor.fun — Royalties to the community",
  description:
    "Flooor is live on Ethereum mainnet with Milady Maker. Bid on the floor, sell instantly, and share 5% of every sale as a holder who signs daily. Royalties to the community.",
  alternates: {
    canonical: "https://flooor.fun/ethereum/milady/",
  },
  openGraph: {
    title: "Flooor on Ethereum — the Milady Maker market is live",
    description: "Royalties to the community. The Milady Maker market is live on Ethereum mainnet.",
    url: "https://flooor.fun/ethereum/milady/",
    siteName: "Flooor",
    images: [
      {
        url: "https://flooor.fun/og-image.png",
        width: 1200,
        height: 630,
        alt: "Flooor on Ethereum — Milady Maker",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Flooor on Ethereum — the Milady Maker market is live",
    description: "Royalties to the community. The Milady Maker market is live on Ethereum mainnet.",
    images: ["https://flooor.fun/og-image.png"],
  },
};

export default function MiladyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
