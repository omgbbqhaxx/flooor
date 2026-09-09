import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QUOTRONS · flooor.fun — 5% royalty accumulates in the daily vault — 16-hour sign phase, 8-hour claim phase",
  description:
    "QUOTRONS on Robinhood Chain — sign daily, claim daily yield, no lockup. Royalties to the community.",
  alternates: {
    canonical: "https://flooor.fun/robinhood/quotrons/",
  },
  openGraph: {
    title: "QUOTRONS — Live on Robinhood Chain | Flooor",
    description: "Sign & claim daily yield. Royalties to the community.",
    url: "https://flooor.fun/robinhood/quotrons/",
    siteName: "Flooor",
    images: [
      {
        url: "https://flooor.fun/og-image.png",
        width: 1200,
        height: 630,
        alt: "QUOTRONS — Live on Robinhood Chain | Flooor",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QUOTRONS — Live on Robinhood Chain | Flooor",
    description: "Sign & claim daily yield. Royalties to the community.",
    images: ["https://flooor.fun/og-image.png"],
  },
};

export default function QuotronsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
