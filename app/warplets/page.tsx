"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { Playfair_Display, Inter } from "next/font/google";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

const INK = "#1A1A1A";
const MUTED = "#75716A";
const HAIRLINE = "#E6E2DA";
const IVORY = "#F7F5F1";
const PLINTH = "#F1EEE8";

const SERIF = { fontFamily: "var(--font-serif)", fontStyle: "italic" as const };
const SANS = { fontFamily: "var(--font-sans)" };
const smallCaps: React.CSSProperties = {
  ...SANS,
  fontSize: "11px",
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: MUTED,
};

export default function WarpletsPage() {
  return (
    <div
      className={`${playfair.variable} ${inter.variable}`}
      style={{ backgroundColor: IVORY, minHeight: "100vh", color: INK }}
    >
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          backgroundColor: "rgba(247,245,241,0.92)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between">
          <Link
            href="/"
            style={{
              ...SERIF,
              fontWeight: 500,
              fontSize: "26px",
              letterSpacing: "0.02em",
              color: INK,
            }}
          >
            Flooor
          </Link>
          <nav className="hidden md:flex items-center gap-10">
            <a
              href="/warplets"
              style={{ ...smallCaps, color: INK }}
            >
              Warplets
            </a>
            <a
              href="https://vrnouns.gitbook.io/flooor/documentation/documentation-en"
              target="_blank"
              rel="noopener noreferrer"
              style={smallCaps}
              className="hover:text-black transition-colors"
            >
              Docs
            </a>
            <a
              href="https://snapshot.org/#/s:vrnouns.eth"
              target="_blank"
              rel="noopener noreferrer"
              style={smallCaps}
              className="hover:text-black transition-colors"
            >
              DAO
            </a>
            <a
              href="https://opensea.io/collection/vrnouns"
              target="_blank"
              rel="noopener noreferrer"
              style={smallCaps}
              className="hover:text-black transition-colors"
            >
              Collection
            </a>
          </nav>
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
                      style={{
                        ...SANS,
                        fontSize: "11px",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        padding: "10px 20px",
                        backgroundColor: INK,
                        color: IVORY,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Connect
                    </button>
                  ) : chain.unsupported ? (
                    <button
                      onClick={openChainModal}
                      style={{
                        ...SANS,
                        fontSize: "11px",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        padding: "10px 20px",
                        backgroundColor: "#9B1C1C",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Wrong Network
                    </button>
                  ) : (
                    <button
                      onClick={openAccountModal}
                      style={{
                        ...SANS,
                        fontSize: "11px",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        padding: "10px 20px",
                        backgroundColor: "transparent",
                        color: INK,
                        border: `1px solid ${HAIRLINE}`,
                        cursor: "pointer",
                      }}
                    >
                      {account.displayName}
                    </button>
                  )}
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-32 flex flex-col items-center text-center">
        <p style={smallCaps}>Coming Soon</p>
        <h1
          style={{
            ...SERIF,
            fontSize: "clamp(40px, 6vw, 72px)",
            fontWeight: 400,
            letterSpacing: "-0.01em",
            lineHeight: 1.1,
            color: INK,
            marginTop: "20px",
            marginBottom: "24px",
          }}
        >
          Warplets
        </h1>
        <p
          style={{
            ...SANS,
            fontSize: "16px",
            lineHeight: 1.7,
            color: MUTED,
            maxWidth: "480px",
          }}
        >
          A new collection is arriving on Flooor. Stay tuned.
        </p>

        <div
          className="mt-16 px-8 py-6"
          style={{
            backgroundColor: PLINTH,
            border: `1px solid ${HAIRLINE}`,
            maxWidth: "400px",
            width: "100%",
          }}
        >
          <p style={{ ...smallCaps, marginBottom: "8px" }}>Royalties to the community</p>
          <p style={{ ...SANS, fontSize: "14px", color: MUTED, lineHeight: 1.6 }}>
            Every sale feeds the vault — distributed to NFT holders daily.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: `1px solid ${HAIRLINE}`,
          padding: "40px 0",
          marginTop: "80px",
        }}
      >
        <div
          className="max-w-6xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4"
        >
          <span style={{ ...SANS, fontSize: "12px", color: MUTED }}>
            © 2024 Flooor. Built on Base.
          </span>
          <div className="flex items-center gap-6">
            <a
              href="https://x.com/vrnouns"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...SANS, fontSize: "12px", color: MUTED }}
            >
              X / Twitter
            </a>
            <a
              href="https://farcaster.xyz/miniapps/pIFtRBsgnWAF/flooorfun"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...SANS, fontSize: "12px", color: MUTED }}
            >
              Farcaster
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
