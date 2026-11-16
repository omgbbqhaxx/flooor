"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  DARK,
  HAIRLINE,
  HEADER_BG,
  INK,
  IVORY,
  MUTED,
  SANS,
  SERIF,
} from "@/app/lib/theme";

type Props = {
  /** Artık header'da gösterilmiyor; sayfalar hâlâ geçtiği için tipte kalıyor. */
  collectionUrl?: string;
  soundOn: boolean;
  onToggleSound: () => void;
  variant?: "light" | "dark";
  /** Günün vault tutarı (ETH, biçimlenmiş) — verilirse logonun yanında
   *  nouns.wtf'teki Treasury kutusu gibi "Daily Treasury" olarak gösterilir. */
  dailyTreasury?: string;
};

const buttonBase = {
  ...SANS,
  fontSize: "11px",
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding: "10px 20px",
  border: "none",
  cursor: "pointer",
} as const;

/** Sticky site header shared by the home page and every collection page. */
export default function SiteHeader({ soundOn, onToggleSound, variant = "light", dailyTreasury }: Props) {
  // Logo bulunulan ağın ana sayfasına döner: Ethereum → /ethereum,
  // Robinhood → /robinhood (LIVES), diğerleri (Base) → /
  const pathname = usePathname() ?? "/";
  const homeHref = pathname.startsWith("/ethereum")
    ? "/ethereum"
    : pathname.startsWith("/robinhood")
      ? "/robinhood"
      : "/";
  const dark = variant === "dark";
  const ink = dark ? DARK.INK : INK;
  const muted = dark ? DARK.MUTED : MUTED;
  const hairline = dark ? DARK.HAIRLINE : HAIRLINE;
  const hover = dark ? "hover:opacity-70" : "hover:text-black";

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        backgroundColor: dark ? DARK.HEADER_BG : HEADER_BG,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderBottom: `1px solid ${hairline}`,
      }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between">
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          <Link
            href={homeHref}
            style={{ ...SERIF, fontWeight: 500, fontSize: "26px", letterSpacing: "0.02em", color: ink }}
          >
            Flooor
          </Link>
          {dailyTreasury !== undefined && (
            // Mobilde dar alan: etiket üstte, tutar altta (iki satır);
            // sm ve üstünde nouns.wtf'teki gibi tek satır
            <div
              className="flex flex-col sm:flex-row justify-center sm:items-center gap-0.5 sm:gap-2.5 h-9 px-2 sm:px-3 whitespace-nowrap shrink-0"
              style={{ border: `1px solid ${hairline}`, borderRadius: 2 }}
            >
              <span className="text-[9px] sm:text-[13px] leading-none" style={{ ...SANS, color: muted }}>Daily Treasury</span>
              <span className="tabular-nums text-[12px] sm:text-[13px] leading-none" style={{ ...SANS, fontWeight: 600, color: ink }}>
                Ξ {dailyTreasury}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSound}
            type="button"
            title={soundOn ? "Bid sound on — click to mute" : "Bid sound off — click to enable"}
            aria-label={soundOn ? "Mute bid sound" : "Enable bid sound"}
            className={`p-3 transition-colors ${hover}`}
            style={{
              color: soundOn ? ink : muted,
              border: `1px solid ${hairline}`,
              backgroundColor: "transparent",
            }}
          >
            {soundOn ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 01-3.4 0" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.7 21a2 2 0 01-3.4 0" />
                <path d="M18.6 13A17.9 17.9 0 0118 8a6 6 0 00-9.3-5" />
                <path d="M6.3 6.3C6.1 6.9 6 7.4 6 8c0 7-3 9-3 9h14" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const ready = mounted;
              const connected = ready && account && chain;
              return (
                <div
                  {...(!ready && {
                    "aria-hidden": true,
                    style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
                  })}
                >
                  {!connected ? (
                    <button
                      onClick={openConnectModal}
                      style={
                        dark
                          ? { ...buttonBase, fontWeight: 700, backgroundColor: DARK.GOLD, color: DARK.IVORY }
                          : { ...buttonBase, backgroundColor: INK, color: IVORY }
                      }
                    >
                      Connect
                    </button>
                  ) : chain.unsupported ? (
                    <button onClick={openChainModal} style={{ ...buttonBase, backgroundColor: "#9B1C1C", color: "#fff" }}>
                      Wrong Network
                    </button>
                  ) : (
                    <button
                      onClick={openAccountModal}
                      style={{ ...buttonBase, backgroundColor: "transparent", color: ink, border: `1px solid ${hairline}` }}
                    >
                      {account.displayName}
                    </button>
                  )}
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>
    </header>
  );
}
