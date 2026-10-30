import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LIVES · flooor.fun — 5% royalty accumulates in the daily vault — 16-hour sign phase, 8-hour claim phase",
  description:
    "LIVES on Robinhood Chain — sign daily, claim daily yield, no lockup. Royalties to the community.",
  alternates: {
    canonical: "https://flooor.fun/robinhood/lives/",
  },
  openGraph: {
    title: "LIVES — Live on Robinhood Chain | Flooor",
    description: "Sign & claim daily yield. Royalties to the community.",
    url: "https://flooor.fun/robinhood/lives/",
    siteName: "Flooor",
    images: [
      {
        url: "https://flooor.fun/og-image.png",
        width: 1200,
        height: 630,
        alt: "LIVES — Live on Robinhood Chain | Flooor",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LIVES — Live on Robinhood Chain | Flooor",
    description: "Sign & claim daily yield. Royalties to the community.",
    images: ["https://flooor.fun/og-image.png"],
  },
};

export default function RobinhoodLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
