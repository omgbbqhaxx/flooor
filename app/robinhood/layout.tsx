import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ronks · flooor.fun — 5% royalty accumulates in the daily vault — sign all morning, claim all night",
  description:
    "Ronks on Robinhood Chain — sign daily, claim daily yield, no lockup. Royalties to the community.",
  alternates: {
    canonical: "https://flooor.fun/robinhood/",
  },
  openGraph: {
    title: "Ronks — Live on Robinhood Chain | Flooor",
    description: "Sign & claim daily yield. Royalties to the community.",
    url: "https://flooor.fun/robinhood/",
    siteName: "Flooor",
    images: [
      {
        url: "https://flooor.fun/og-image.png",
        width: 1200,
        height: 630,
        alt: "Ronks — Live on Robinhood Chain | Flooor",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ronks — Live on Robinhood Chain | Flooor",
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
