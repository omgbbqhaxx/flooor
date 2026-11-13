import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pudgy Penguins · flooor.fun — Royalties to the community",
  description:
    "Flooor is live on Ethereum mainnet with Pudgy Penguins. Bid on the floor, sell instantly, and share 5% of every sale as a holder who signs daily. Royalties to the community.",
  alternates: {
    canonical: "https://flooor.fun/ethereum/pudgy/",
  },
  openGraph: {
    title: "Flooor on Ethereum — the Pudgy Penguins market is live",
    description: "Royalties to the community. The Pudgy Penguins market is live on Ethereum mainnet.",
    url: "https://flooor.fun/ethereum/pudgy/",
    siteName: "Flooor",
    images: [
      {
        url: "https://flooor.fun/og-image.png",
        width: 1200,
        height: 630,
        alt: "Flooor on Ethereum — Pudgy Penguins",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Flooor on Ethereum — the Pudgy Penguins market is live",
    description: "Royalties to the community. The Pudgy Penguins market is live on Ethereum mainnet.",
    images: ["https://flooor.fun/og-image.png"],
  },
};

export default function PudgyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
