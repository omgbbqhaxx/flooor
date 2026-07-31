"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
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
const GREEN = "#1E7B4F";
const GOLD = "#A4863D";
const SKY = "#99ccff";

const serif = { fontFamily: "var(--font-serif)" } as const;
const sans = { fontFamily: "var(--font-sans)" } as const;
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

function HoloCard({
  card,
}: {
  card: (typeof dummyCards)[number];
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0, glowX: 50, glowY: 50 });

  const style = useMemo(() => {
    return {
      transform: `perspective(1100px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
      backgroundImage: `
        radial-gradient(circle at ${tilt.glowX}% ${tilt.glowY}%, rgba(255,255,255,0.95), rgba(255,255,255,0.25) 20%, rgba(0,0,0,0) 50%),
        linear-gradient(135deg, rgba(17,24,39,0.95), rgba(75,85,99,0.9)),
        linear-gradient(120deg, ${SKY}, #9b5de5, #f15bb5, #00bbf9)
      `,
    } as const;
  }, [tilt]);

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const px = (x / rect.width) * 100;
    const py = (y / rect.height) * 100;
    const rotateY = ((x / rect.width) * 18 - 9).toFixed(2);
    const rotateX = (9 - (y / rect.height) * 18).toFixed(2);

    setTilt({
      x: Number(rotateX),
      y: Number(rotateY),
      glowX: px,
      glowY: py,
    });
  };

  return (
    <div
      onMouseMove={handleMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0, glowX: 50, glowY: 50 })}
      className="card-shell"
      style={{
        position: "relative",
        width: 250,
        height: 250,
        borderRadius: 24,
        padding: 8,
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.95), rgba(210,222,252,0.8), rgba(255,255,255,0.95))",
        boxShadow: "0 18px 36px rgba(17, 24, 39, 0.12)",
        transition: "transform 180ms ease",
      }}
    >
      <div
        className="card-art"
        style={{
          ...style,
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: 18,
          overflow: "hidden",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.34)",
          transition: "transform 150ms ease",
        }}
      >
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
    <main
      style={{ backgroundColor: IVORY, color: INK, minHeight: "100vh" }}
      className={`${playfair.variable} ${inter.variable}`}
    >
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 24px 96px" }}>
        <Link
          href="/"
          style={{
            ...smallCaps,
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            textDecoration: "none",
            color: INK,
            border: `1px solid ${HAIRLINE}`,
            padding: "10px 14px",
            backgroundColor: "#fff",
          }}
        >
          ← Back to Flooor
        </Link>

        <section
          style={{
            marginTop: 32,
            padding: "36px",
            border: `1px solid ${HAIRLINE}`,
            backgroundColor: "#fff",
            boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            <Image
              src="/onchdin.svg"
              alt="Based Onchain Dinos"
              width={140}
              height={140}
              style={{ objectFit: "contain", border: `1px solid ${HAIRLINE}` }}
            />
            <div style={{ flex: 1, minWidth: 240 }}>
              <p style={smallCaps}>New collection</p>
              <h1
                style={{
                  ...serif,
                  fontSize: "clamp(2rem, 4vw, 3rem)",
                  margin: "10px 0 12px",
                  lineHeight: 1.05,
                }}
              >
                Based Onchain Dinos
              </h1>
              <p
                style={{
                  ...sans,
                  fontSize: "1rem",
                  lineHeight: 1.75,
                  color: MUTED,
                  maxWidth: 760,
                  margin: 0,
                }}
              >
                A Base-native collectible preview experience with a temporary Poke Holo-inspired
                showcase. The current art direction is a warmup for the real collection metadata,
                drop mechanics, and onchain mint flow that will arrive soon.
              </p>

              <div
                style={{
                  marginTop: 24,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <Link
                  href="/"
                  style={{
                    ...smallCaps,
                    textDecoration: "none",
                    color: "#fff",
                    backgroundColor: GREEN,
                    padding: "12px 16px",
                  }}
                >
                  Go to home
                </Link>
                <span
                  style={{
                    ...smallCaps,
                    border: `1px solid ${HAIRLINE}`,
                    padding: "12px 16px",
                    backgroundColor: IVORY,
                  }}
                >
                  Placeholder mint deck · dummy Base data
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            marginTop: 24,
            padding: "28px",
            border: `1px solid ${HAIRLINE}`,
            background: "linear-gradient(135deg, #fff 0%, #f6f0df 100%)",
          }}
        >
          <p style={{ ...smallCaps, color: GOLD }}>Preview cards</p>
          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
              justifyItems: "center",
            }}
          >
            {dummyCards.map((card, index) => (
              <HoloCard key={`${card.name}-${index}`} card={card} />
            ))}
          </div>
        </section>

        <section
          style={{
            marginTop: 24,
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          }}
        >
          {[
            {
              title: "Status",
              value: "Preview mode",
              desc: "NFT visuals are mocked with realistic Base-themed metadata placeholders.",
            },
            {
              title: "Contract",
              value: "TBD",
              desc: "The deployed contract address and ABI will be wired here as soon as the drop is ready.",
            },
            {
              title: "Launch plan",
              value: "Soon",
              desc: "After the rollout is finalized, the dummy data will be replaced with the real collection metadata.",
            },
          ].map((item) => (
            <div
              key={item.title}
              style={{
                border: `1px solid ${HAIRLINE}`,
                backgroundColor: "#fff",
                padding: "24px",
              }}
            >
              <p style={{ ...smallCaps, color: GOLD }}>{item.title}</p>
              <h2
                style={{
                  ...serif,
                  fontSize: "1.35rem",
                  margin: "8px 0 6px",
                }}
              >
                {item.value}
              </h2>
              <p style={{ ...sans, margin: 0, color: MUTED, lineHeight: 1.7 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
