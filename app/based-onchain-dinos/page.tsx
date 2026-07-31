"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useRef } from "react";
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
const SKY = "#99ccff";

const SERIF = { fontFamily: "var(--font-serif)" } as const;
const SANS = { fontFamily: "var(--font-sans)" } as const;
const serif = SERIF;
const sans = SANS;
const smallCaps = {
  ...sans,
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.18em",
  textTransform: "uppercase" as const,
  color: MUTED,
};

const dummyCards = [
  {
    name: "Dino #001",
    family: "Aurora Ridge",
    rarity: "Base Holo",
    trait: "Mint Layer",
    sponsor: "Base App",
    network: "Base",
    power: "+8",
    serial: "AUR-001",
  },
  {
    name: "Dino #022",
    family: "Velvet Grid",
    rarity: "Reverse Holo",
    trait: "Onchain Glow",
    sponsor: "Coinbase Wallet",
    network: "Base",
    power: "+12",
    serial: "VEL-022",
  },
  {
    name: "Dino #045",
    family: "Sunset Relay",
    rarity: "Full Art",
    trait: "Dapp Signal",
    sponsor: "Base Séance",
    network: "Base",
    power: "+16",
    serial: "SUN-045",
  },
  {
    name: "Dino #078",
    family: "Blue Orbit",
    rarity: "Silver Holo",
    trait: "Registry Mark",
    sponsor: "Base Ecosystem",
    network: "Base",
    power: "+11",
    serial: "BLO-078",
  },
  {
    name: "Dino #099",
    family: "Nebula Bump",
    rarity: "Galaxy Holo",
    trait: "Mint Pulse",
    sponsor: "Farcaster",
    network: "Base",
    power: "+20",
    serial: "NEB-099",
  },
  {
    name: "Dino #113",
    family: "Bridge Sprint",
    rarity: "Rainbow Rare",
    trait: "Transfer Burst",
    sponsor: "Base App",
    network: "Base",
    power: "+18",
    serial: "BRI-113",
  },
];

// Pointer-driven holographic card, modeled on the poke-holo.simey.me technique:
// mouse position is written directly to CSS custom properties on the DOM node
// (no React re-render per move) and the foil/sparkle/glare layers read those
// vars for their gradient position + opacity.
function HoloCard({ card }: { card: (typeof dummyCards)[number] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

  const updateFromPointer = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * 100;
    const py = ((clientY - rect.top) / rect.height) * 100;
    const clampedX = Math.min(100, Math.max(0, px));
    const clampedY = Math.min(100, Math.max(0, py));

    // Distance of the pointer from the card center, 0 (center) -> 1 (corner).
    const centerDist = Math.min(
      1,
      Math.hypot(clampedX - 50, clampedY - 50) / 70,
    );

    const rotateY = ((clampedX / 100) * 22 - 11).toFixed(2);
    const rotateX = (9 - (clampedY / 100) * 18).toFixed(2);

    el.style.setProperty("--px", `${clampedX}%`);
    el.style.setProperty("--py", `${clampedY}%`);
    el.style.setProperty("--rx", `${rotateY}deg`);
    el.style.setProperty("--ry", `${rotateX}deg`);
    el.style.setProperty("--pointer-from-center", centerDist.toFixed(3));
  }, []);

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const { clientX, clientY } = event;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() =>
      updateFromPointer(clientX, clientY),
    );
  };

  const handleLeave = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    const el = wrapRef.current;
    if (!el) return;
    el.style.setProperty("--px", "50%");
    el.style.setProperty("--py", "50%");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--pointer-from-center", "0");
    el.classList.remove("is-active");
  };

  const handleEnter = () => {
    wrapRef.current?.classList.add("is-active");
  };

  return (
    <div
      ref={wrapRef}
      onMouseMove={handleMove}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className="dino-holo-card"
      style={{
        position: "relative",
        width: 250,
        height: 250,
        borderRadius: 24,
        padding: 8,
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(210,222,252,0.8), rgba(255,255,255,0.95))",
        boxShadow: "0 18px 36px rgba(17, 24, 39, 0.12)",
      }}
    >
      <style jsx>{`
        .dino-holo-card {
          --px: 50%;
          --py: 50%;
          --rx: 0deg;
          --ry: 0deg;
          --pointer-from-center: 0;
          perspective: 1200px;
        }
        .dino-holo-card__inner {
          transform: perspective(1100px) rotateX(var(--ry)) rotateY(var(--rx));
          transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .dino-holo-card.is-active .dino-holo-card__inner {
          transition: transform 0.08s ease-out;
        }
        .dino-holo-card__foil,
        .dino-holo-card__sparkle,
        .dino-holo-card__glare {
          transition: opacity 0.6s ease;
        }
        .dino-holo-card.is-active .dino-holo-card__foil,
        .dino-holo-card.is-active .dino-holo-card__sparkle,
        .dino-holo-card.is-active .dino-holo-card__glare {
          transition: opacity 0.15s ease;
        }
      `}</style>
      <div
        className="dino-holo-card__inner card-art"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: 18,
          overflow: "hidden",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.34)",
          backgroundImage:
            "linear-gradient(135deg, rgba(17,24,39,0.95), rgba(75,85,99,0.9))",
        }}
      >
        {/* base texture — soft diagonal sheen */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.16), rgba(0,0,0,0.32)), repeating-linear-gradient(115deg, rgba(255,255,255,0.42) 0 6px, rgba(255,255,255,0) 6px 12px)",
            mixBlendMode: "screen",
            opacity: 0.65,
            pointerEvents: "none",
          }}
        />

        {/* rainbow foil — parallax rainbow bands that track the pointer */}
        <div
          className="dino-holo-card__foil"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `repeating-linear-gradient(115deg, ${SKY} 0%, #9b5de5 12%, #f15bb5 24%, #ffd166 36%, #00bbf9 48%, ${SKY} 60%)`,
            backgroundSize: "220% 220%",
            backgroundPosition: "var(--px) var(--py)",
            mixBlendMode: "color-dodge",
            opacity: "calc(0.15 + var(--pointer-from-center) * 0.55)",
            pointerEvents: "none",
          }}
        />

        {/* glitter — fine sparkle grid, also parallaxed by pointer */}
        <div
          className="dino-holo-card__sparkle"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.95) 1px, transparent 1.6px)",
            backgroundSize: "7px 7px",
            backgroundPosition: "var(--px) var(--py)",
            mixBlendMode: "color-dodge",
            opacity: "calc(var(--pointer-from-center) * 0.5)",
            pointerEvents: "none",
          }}
        />

        {/* glare — soft spotlight that follows the cursor */}
        <div
          className="dino-holo-card__glare"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at var(--px) var(--py), rgba(255,255,255,0.85), rgba(255,255,255,0) 55%)",
            mixBlendMode: "overlay",
            opacity: "calc(0.08 + var(--pointer-from-center) * 0.55)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 12,
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.28)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "absolute", left: 16, right: 16, top: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ ...smallCaps, color: "#fff", fontSize: 10, letterSpacing: "0.18em" }}>{card.network}</span>
          <span style={{ ...smallCaps, color: "#fff", fontSize: 10 }}>{card.rarity}</span>
        </div>

        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 16,
            padding: 12,
            borderRadius: 14,
            background: "rgba(5, 12, 28, 0.38)",
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.18)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ ...smallCaps, color: "#fff", fontSize: 9, margin: 0 }}>{card.family}</p>
              <p style={{ ...serif, margin: "6px 0 0", fontSize: 20, color: "#fff" }}>{card.name}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ ...smallCaps, color: "#fff", fontSize: 9, margin: 0 }}>Power</p>
              <p style={{ ...serif, margin: "2px 0 0", fontSize: 24, color: "#fff" }}>{card.power}</p>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.22)", paddingTop: 8 }}>
              <p style={{ ...smallCaps, color: "#fff", fontSize: 8, margin: 0 }}>Trait</p>
              <p style={{ ...sans, color: "#fff", fontSize: 12, margin: "3px 0 0" }}>{card.trait}</p>
            </div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.22)", paddingTop: 8 }}>
              <p style={{ ...smallCaps, color: "#fff", fontSize: 8, margin: 0 }}>Sponsor</p>
              <p style={{ ...sans, color: "#fff", fontSize: 12, margin: "3px 0 0" }}>{card.sponsor}</p>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ ...smallCaps, color: "#fff", fontSize: 8 }}>#{card.serial}</span>
            <span style={{ ...smallCaps, color: "#fff", fontSize: 8 }}>Preview</span>
          </div>
        </div>
      </div>
    </div>
  );
}

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
            <div
              className="flex items-center justify-center p-8 sm:p-14"
              style={{ backgroundColor: PLINTH }}
            >
              <Image
                src="/onchdin.svg"
                alt="Based Onchain Dinos"
                width={440}
                height={440}
                className="w-full h-auto max-w-[440px] fade-in-soft"
                style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
              />
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-3">
              <p
                className="text-sm flex-1 min-w-0"
                style={{ ...SERIF, fontStyle: "italic", color: MUTED }}
              >
                Based Onchain Dinos — Base, onchain
              </p>
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

        {/* Preview cards — poke-holo-style art direction warmup */}
        <div className="mt-20 pt-14" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          <p style={smallCaps}>Preview cards</p>
          <p
            className="mt-3 text-base leading-relaxed"
            style={{ ...SANS, color: MUTED, maxWidth: "60ch" }}
          >
            A holographic art-direction preview — dummy metadata standing in
            for the real collection until mint mechanics are finalized.
          </p>
          <div
            className="mt-8 grid gap-4 justify-items-center"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
          >
            {dummyCards.map((card, index) => (
              <HoloCard key={`${card.name}-${index}`} card={card} />
            ))}
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
