"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Image from "next/image";
import Link from "next/link";
import { Playfair_Display, Inter } from "next/font/google";
import { HoloFrame } from "@/app/components/HoloFrame";

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

// Not deployed yet — same gate pattern used on /warplets. Flip once the
// contract ships and wire the real address + ABI in (see the
// contract-vs-frontend-sync project skill before touching this).
const CONTRACT_ADDR = "0x0000000000000000000000000000000000000000" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const IS_DEPLOYED = CONTRACT_ADDR.toLowerCase() !== ZERO_ADDRESS;

const INK = "#1A1A1A";
const MUTED = "#75716A";
const HAIRLINE = "#E6E2DA";
const IVORY = "#F7F5F1";
const PLINTH = "#F1EEE8";
const GOLD = "#A4863D";

const SERIF = { fontFamily: "var(--font-serif)" } as const;
const SANS = { fontFamily: "var(--font-sans)" } as const;
const smallCaps = {
  ...SANS,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.18em",
  textTransform: "uppercase" as const,
  color: MUTED,
};

export default function BasedOnchainDinosPage() {
  return (
    <div
      style={{ backgroundColor: IVORY, color: INK, minHeight: "100vh" }}
      className={`${playfair.variable} ${inter.variable}`}
    >
      {/* Header — same shell as /warplets so every collection page reads as one family */}
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
          </nav>
          <div className="flex items-center gap-3">
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                mounted,
              }) => {
                const ready = mounted;
                const connected = ready && account && chain;
                return (
                  <div
                    {...(!ready && {
                      "aria-hidden": true,
                      style: {
                        opacity: 0,
                        pointerEvents: "none",
                        userSelect: "none",
                      },
                    })}
                  >
                    {!connected ? (
                      <button
                        onClick={openConnectModal}
                        type="button"
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
                        type="button"
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
                        type="button"
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
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-8">
        {/* Lot hero */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 pt-12 lg:pt-16 items-start">
          {/* Artwork */}
          <div className="lg:sticky lg:top-28">
            <div className="flex items-center justify-center py-4">
              {/* Trading-card shell — gold foil border + cardstock body, like a real TCG card */}
              <div
                className="w-full max-w-[420px] fade-in-soft"
                style={{
                  padding: 9,
                  borderRadius: 24,
                  backgroundImage:
                    "linear-gradient(155deg, #f6e2a0 0%, #c9a13d 22%, #fff6d9 42%, #a9782a 62%, #f6e2a0 80%, #dcb44e 100%)",
                  boxShadow:
                    "0 24px 48px rgba(17,24,39,0.22), 0 2px 6px rgba(0,0,0,0.12)",
                }}
              >
                <div
                  style={{
                    borderRadius: 18,
                    backgroundColor: "#fdfaf1",
                    padding: 12,
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  {/* Name + rarity row */}
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span
                      style={{
                        ...SERIF,
                        fontWeight: 600,
                        fontSize: 17,
                        color: INK,
                      }}
                    >
                      Based Onchain Dinos
                    </span>
                    <span
                      style={{
                        ...smallCaps,
                        fontSize: 9,
                        color: GOLD,
                        border: `1px solid ${GOLD}`,
                        padding: "3px 8px",
                        borderRadius: 999,
                        whiteSpace: "nowrap",
                      }}
                    >
                      flooor.fun ✦
                    </span>
                  </div>

                  {/* Art window */}
                  <div className="mt-2">
                    <HoloFrame
                      className="w-full"
                      overlay={
                        <div
                          style={{
                            position: "absolute",
                            left: 10,
                            right: 10,
                            bottom: 10,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              ...smallCaps,
                              color: "#fff",
                              fontSize: 9,
                              padding: "4px 9px",
                              backgroundColor: "rgba(5,12,28,0.42)",
                              backdropFilter: "blur(6px)",
                              border: "1px solid rgba(255,255,255,0.22)",
                            }}
                          >
                            Base
                          </span>
                          <span
                            style={{
                              ...smallCaps,
                              color: "#fff",
                              fontSize: 9,
                              padding: "4px 9px",
                              backgroundColor: "rgba(5,12,28,0.42)",
                              backdropFilter: "blur(6px)",
                              border: "1px solid rgba(255,255,255,0.22)",
                            }}
                          >
                            Onchain
                          </span>
                        </div>
                      }
                    >
                      <Image
                        src="/onchdin.svg"
                        alt="Based Onchain Dinos"
                        width={440}
                        height={440}
                        className="w-full h-auto"
                      />
                    </HoloFrame>
                  </div>

                  {/* Meta strip */}
                  <div className="mt-3 flex items-center justify-between px-1">
                    <span style={{ ...smallCaps, fontSize: 9 }}>
                      No. 001 · Base
                    </span>
                    <a
                      href="https://opensea.io/collection/based-onchain-dinos"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...smallCaps, fontSize: 9 }}
                      className="hover:text-black transition-colors"
                    >
                      Collection Preview
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lot details */}
          <div>
            <p style={{ ...smallCaps, color: GOLD }}>
              {IS_DEPLOYED && <span className="live-dot mr-2" aria-hidden />}
              {!IS_DEPLOYED ? "Coming Soon" : "Live on Base"}
            </p>
            <h1
              className="mt-4"
              style={{
                ...SERIF,
                fontWeight: 500,
                fontSize: "clamp(36px, 4.6vw, 58px)",
                lineHeight: 1.08,
                letterSpacing: "-0.01em",
              }}
            >
              Based Onchain Dinos
            </h1>
            <p
              className="mt-3 text-base leading-relaxed"
              style={{ ...SANS, color: MUTED, maxWidth: "48ch" }}
            >
              A new collection on Flooor. Every sale feeds the vault —
              distributed to holders daily.
            </p>

            <div
              className="mt-10 px-8 py-6"
              style={{ backgroundColor: PLINTH, border: `1px solid ${HAIRLINE}` }}
            >
              <p style={{ ...smallCaps, marginBottom: "8px" }}>
                Royalties to the community
              </p>
              <p style={{ ...SANS, fontSize: "14px", color: MUTED, lineHeight: 1.6 }}>
                The Based Onchain Dinos contract is being finalized and
                isn&apos;t live yet. Connect your wallet to be ready when it
                ships.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{ borderTop: `1px solid ${HAIRLINE}`, padding: "40px 0", marginTop: "80px" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span style={{ ...SANS, fontSize: "12px", color: MUTED }}>
              © 2024 Flooor. Built on Base.
            </span>
            <span
              style={{
                ...SANS,
                fontSize: "11px",
                color: MUTED,
                fontFamily: "monospace",
              }}
            >
              Contract: TBD
            </span>
          </div>
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
