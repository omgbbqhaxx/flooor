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
const GREEN = "#1E7B4F";

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

export default function OkComputersPage() {
  return (
    <main style={{ backgroundColor: IVORY, color: INK, minHeight: "100vh" }} className={`${playfair.variable} ${inter.variable}`}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 24px 96px" }}>
        <Link href="/" style={{ ...smallCaps, display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", color: INK, border: `1px solid ${HAIRLINE}`, padding: "10px 14px", backgroundColor: "#fff" }}>
          ← Back to Flooor
        </Link>

        <section style={{ marginTop: 32, padding: "36px", border: `1px solid ${HAIRLINE}`, backgroundColor: "#fff", boxShadow: "0 10px 30px rgba(0,0,0,0.04)" }}>
          <p style={smallCaps}>Collection</p>
          <h1 style={{ ...serif, fontSize: "clamp(2rem, 4vw, 3rem)", margin: "10px 0 12px", lineHeight: 1.05 }}>OK Computers</h1>
          <p style={{ ...sans, fontSize: "1rem", lineHeight: 1.75, color: MUTED, maxWidth: 760, margin: 0 }}>
            This collection page is now live as a placeholder while content and launch details are being finalized.
          </p>
          <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Link href="/" style={{ ...smallCaps, textDecoration: "none", color: "#fff", backgroundColor: GREEN, padding: "12px 16px" }}>Go to home</Link>
            <span style={{ ...smallCaps, border: `1px solid ${HAIRLINE}`, padding: "12px 16px", backgroundColor: IVORY }}>Coming soon</span>
          </div>
        </section>
      </div>
    </main>
  );
}
