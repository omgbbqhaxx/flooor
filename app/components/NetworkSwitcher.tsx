import Link from "next/link";
import { DARK, INK, IVORY, SANS } from "@/app/lib/theme";

// Ağlar arası geçiş: header'ın altında ince, köşeli, eşit genişlikte
// dikdörtgenler. Bulunulan ağ dolgulu (aktif) gösterilir, diğerleri o ağın ana
// sayfasına link verir. Robinhood sayfası koyu temada → variant="dark".
const NETWORKS = [
  { key: "base", label: "/base", href: "/", dot: "#0052FF" },
  { key: "robinhood", label: "/robinhood", href: "/robinhood", dot: "#00C805" },
  { key: "ethereum", label: "/ethereum", href: "/ethereum", dot: "#627EEA" },
] as const;

export type NetworkKey = (typeof NETWORKS)[number]["key"];

const PALETTES = {
  light: {
    text: INK,
    activeText: IVORY,
    activeBg: INK,
    border: "border-[#D9D4CA] hover:border-[#1A1A1A]",
    activeBorder: "border-[#1A1A1A]",
  },
  dark: {
    text: DARK.INK,
    activeText: DARK.IVORY,
    activeBg: DARK.INK,
    border: "border-[#2E2E2E] hover:border-[#F2F2ED]",
    activeBorder: "border-[#F2F2ED]",
  },
} as const;

export default function NetworkSwitcher({
  current,
  variant = "light",
}: {
  current: NetworkKey;
  variant?: "light" | "dark";
}) {
  const p = PALETTES[variant];
  return (
    <nav aria-label="Networks" className="grid grid-cols-3 gap-2 pt-5 lg:pt-6">
      {NETWORKS.map((n) => {
        const active = n.key === current;
        const tile = (
          <>
            <span
              aria-hidden
              className="shrink-0"
              style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: n.dot }}
            />
            <span style={{ ...SANS, fontSize: 13, fontWeight: 600, letterSpacing: "0.01em", color: active ? p.activeText : p.text }}>
              {n.label}
            </span>
          </>
        );
        const base = "flex items-center justify-center gap-2 h-8 px-2 min-w-0 border";
        return active ? (
          <div key={n.key} aria-current="page" className={`${base} ${p.activeBorder}`} style={{ borderRadius: 2, backgroundColor: p.activeBg }}>
            {tile}
          </div>
        ) : (
          // Pasif kutuların kenarı class'ta — hover'da koyulaşsın diye
          <Link
            key={n.key}
            href={n.href}
            className={`${base} ${p.border} transition-colors duration-200`}
            style={{ borderRadius: 2 }}
          >
            {tile}
          </Link>
        );
      })}
    </nav>
  );
}
