import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RH Machines · flooor.fun — 5% royalty accumulates in the daily vault — 16-hour sign phase, 8-hour claim phase",
  description:
    "RH Machines on Robinhood Chain — sign daily, claim daily yield, no lockup. Royalties to the community.",
  alternates: {
    canonical: "https://flooor.fun/robinhood/",
  },
  openGraph: {
    title: "RH Machines — Live on Robinhood Chain | Flooor",
    description: "Sign & claim daily yield. Royalties to the community.",
    url: "https://flooor.fun/robinhood/",
    siteName: "Flooor",
    images: [
      {
        url: "https://flooor.fun/og-image.png",
        width: 1200,
        height: 630,
        alt: "RH Machines — Live on Robinhood Chain | Flooor",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RH Machines — Live on Robinhood Chain | Flooor",
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
