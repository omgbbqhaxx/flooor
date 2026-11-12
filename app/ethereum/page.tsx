"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Playfair_Display, Inter } from "next/font/google";
import SiteHeader from "@/app/components/SiteHeader";
import Footer from "@/app/components/Footer";
import { HoloFrame } from "@/app/components/HoloFrame";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

// Apple devices render their own San Francisco via the system stack (SF Pro
// can't be self-hosted under Apple's licence); everyone else falls back to Inter.
const SF_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", var(--font-inter), sans-serif';

// Nouns on Ethereum mainnet (nouns.wtf). The artwork in /public/nouns-eth is
// the on-chain SVG returned by this contract's tokenURI.
const NOUNS_TOKEN = "0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03" as const;
// Footer still points at the live Base market until the Ethereum contract ships.
const BASE_CONTRACT_ADDR = "0xD53292182A342953f446CD4D10Dc177776044306" as const;
const LAUNCH_AT = Date.UTC(2026, 10, 12, 0, 0, 0); // 12 Nov 2026, 00:00 UTC

// Apple-style palette, scoped to this page only.
const WHITE = "#FFFFFF";
const SNOW = "#F5F5F7";
const TEXT = "#1D1D1F";
const SUBTLE = "#6E6E73";
const FAINT = "#86868B";
const LINK = "#0071E3";

const SANS = { fontFamily: "var(--font-sans)" } as const;
const HEADLINE = { ...SANS, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.06 } as const;
const EYEBROW = { ...SANS, fontSize: "14px", fontWeight: 600, color: SUBTLE } as const;

const GALLERY = [0, 1, 2, 3, 7];

const STEPS = [
  {
    eyebrow: "Bid",
    title: "Bid on the flooor.",
    body: "Place a standing bid on any Noun. Every holder sees the best flooor offer, live.",
  },
  {
    eyebrow: "Sell",
    title: "Sell instantly.",
    body: "Holders accept the top bid in a single signature — approve and sell in one step.",
  },
  {
    eyebrow: "Earn",
    title: "Sign daily. Share 5%.",
    body: "5% of every sale fills the daily vault and splits evenly among holders who sign. No staking, no lockup.",
  },
];

function useCountdown(target: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const diff = Math.max(0, target - now);
  return {
    live: diff === 0,
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor(diff / 3_600_000) % 24,
    minutes: Math.floor(diff / 60_000) % 60,
    seconds: Math.floor(diff / 1000) % 60,
  };
}

function Chevron() {
  return (
    <svg width="8" height="12" viewBox="0 0 8 12" fill="none" aria-hidden="true" className="inline-block ml-1 -mt-px">
      <path d="M1.5 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function EthereumPage() {
  const [soundOn, setSoundOn] = useState(false);
  const toggleSound = useCallback(() => setSoundOn((v) => !v), []);
  const countdown = useCountdown(LAUNCH_AT);

  const units = [
    { label: "Days", value: countdown?.days },
    { label: "Hours", value: countdown?.hours },
    { label: "Minutes", value: countdown?.minutes },
    { label: "Seconds", value: countdown?.seconds },
  ];

  return (
    <div
      className={`eth-apple ${playfair.variable} ${inter.variable}`}
      style={
        {
          "--font-sans": SF_STACK,
          backgroundColor: WHITE,
          minHeight: "100vh",
          color: TEXT,
          ...SANS,
          WebkitFontSmoothing: "antialiased",
        } as React.CSSProperties
      }
    >
      <SiteHeader
        collectionUrl={`https://opensea.io/assets/ethereum/${NOUNS_TOKEN}`}
        soundOn={soundOn}
        onToggleSound={toggleSound}
      />
      {/* Page-scoped: frosted white header without touching the shared SiteHeader. */}
      <style>{`.eth-apple > header{background-color:rgba(255,255,255,0.72)!important;backdrop-filter:saturate(180%) blur(20px)!important;-webkit-backdrop-filter:saturate(180%) blur(20px)!important}`}</style>

      <main className="max-w-6xl mx-auto px-5 sm:px-8">
        {/* Hero */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.12fr_1fr] gap-12 lg:gap-16 pt-12 lg:pt-16 items-start">
          <div className="order-2">
            <p className="flex items-center gap-2" style={{ ...EYEBROW, color: LINK }}>
              <span aria-hidden="true" className="rounded-full" style={{ width: 7, height: 7, backgroundColor: LINK }} />
              Ethereum Mainnet · Coming 12 November
            </p>
            <h1 className="mt-4" style={{ ...HEADLINE, fontSize: "clamp(44px, 6vw, 72px)" }}>
              Flooor arrives
              <br />
              on Ethereum.
            </h1>
            <p className="mt-6 max-w-md" style={{ fontSize: "19px", lineHeight: 1.42, color: SUBTLE, letterSpacing: "-0.01em" }}>
              The first Ethereum market opens with Nouns — one Noun, every day, forever. Bid on the flooor, sell
              instantly, and share 5% of every sale with the holders who sign.
            </p>
            <p className="mt-4" style={{ fontSize: "21px", fontWeight: 600, letterSpacing: "-0.015em" }}>
              Royalties to the community.
            </p>

            {/* Countdown */}
            <div className="mt-10">
              {countdown?.live ? (
                <div className="rounded-[22px] px-6 py-6" style={{ backgroundColor: SNOW }}>
                  <p style={{ ...HEADLINE, fontSize: "28px", color: "#1E7B4F" }}>The Nouns market is live.</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                  {units.map((u) => (
                    <div key={u.label} className="rounded-[20px] py-5 text-center" style={{ backgroundColor: SNOW }}>
                      <p className="tabular-nums" style={{ ...HEADLINE, fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1 }}>
                        {u.value === undefined ? "--" : String(u.value).padStart(2, "0")}
                      </p>
                      <p className="mt-2" style={{ fontSize: "12px", color: FAINT }}>
                        {u.label}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-3" style={{ fontSize: "13px", color: FAINT }}>
              Thursday, 12 November 2026 · 00:00 UTC
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
              <a
                href="https://nouns.wtf"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full transition-opacity hover:opacity-85"
                style={{ backgroundColor: LINK, color: WHITE, fontSize: "17px", padding: "12px 24px" }}
              >
                Explore Nouns
              </a>
              <Link href="/" className="hover:underline" style={{ color: LINK, fontSize: "17px" }}>
                Live market on Base
                <Chevron />
              </Link>
            </div>
          </div>

          {/* Artwork */}
          <div className="order-1 lg:sticky lg:top-28 flex justify-center">
            <div className="w-full max-w-[560px] rounded-[32px] overflow-hidden" style={{ backgroundColor: SNOW }}>
              <div className="flex items-center justify-between px-6 pt-5">
                <span style={EYEBROW}>Lot 0 · Nouns</span>
                <span style={{ ...EYEBROW, color: FAINT, fontWeight: 500 }}>Ethereum</span>
              </div>
              <div className="p-5">
                <div className="rounded-[22px] overflow-hidden" style={{ boxShadow: "0 30px 60px -30px rgba(0,0,0,0.35)" }}>
                  <HoloFrame>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/nouns-eth/noun-0.svg"
                      alt="Noun 0 — rendered on-chain on Ethereum"
                      width={320}
                      height={320}
                      className="block w-full h-auto"
                      style={{ imageRendering: "pixelated" }}
                    />
                  </HoloFrame>
                </div>
              </div>
              <div className="flex items-baseline justify-between px-6 pb-6">
                <p style={{ ...HEADLINE, fontSize: "24px" }}>Noun 0</p>
                <a
                  href={`https://etherscan.io/token/${NOUNS_TOKEN}?a=0`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tabular-nums hover:underline"
                  style={{ fontSize: "13px", color: LINK }}
                >
                  {NOUNS_TOKEN.slice(0, 6)}…{NOUNS_TOKEN.slice(-4)}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-28">
          <h2 style={{ ...HEADLINE, fontSize: "clamp(32px, 5vw, 48px)" }}>How it works</h2>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
            {STEPS.map((s) => (
              <div key={s.title} className="rounded-[28px] p-8" style={{ backgroundColor: SNOW }}>
                <p style={EYEBROW}>{s.eyebrow}</p>
                <h3 className="mt-3" style={{ ...HEADLINE, fontSize: "26px", lineHeight: 1.15 }}>
                  {s.title}
                </h3>
                <p className="mt-3" style={{ fontSize: "17px", lineHeight: 1.47, color: SUBTLE }}>
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Gallery */}
        <section className="mt-28">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p style={EYEBROW}>From the chain</p>
              <h2 className="mt-2" style={{ ...HEADLINE, fontSize: "clamp(32px, 5vw, 48px)" }}>
                The earliest Nouns.
              </h2>
            </div>
            <a
              href="https://nouns.wtf"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline hover:underline shrink-0"
              style={{ color: LINK, fontSize: "17px" }}
            >
              nouns.wtf
              <Chevron />
            </a>
          </div>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {GALLERY.map((id) => (
              <a
                key={id}
                href={`https://nouns.wtf/noun/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-[24px] overflow-hidden"
                style={{ backgroundColor: SNOW }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/nouns-eth/noun-${id}.svg`}
                  alt={`Noun ${id}`}
                  width={320}
                  height={320}
                  loading="lazy"
                  className="block w-full h-auto transition-transform duration-500 group-hover:scale-[1.04]"
                  style={{ imageRendering: "pixelated" }}
                />
                <p className="px-4 py-3" style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.01em" }}>
                  Noun {id}
                </p>
              </a>
            ))}
          </div>
          <p className="mt-4" style={{ fontSize: "12px", color: FAINT }}>
            Artwork rendered on-chain by the Nouns token contract on Ethereum. Nouns are CC0.
          </p>
        </section>
      </main>

      <Footer contractAddr={BASE_CONTRACT_ADDR} contractVersion="v2.0 · Altai" />
    </div>
  );
}
