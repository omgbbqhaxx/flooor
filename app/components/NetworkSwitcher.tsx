import Link from "next/link";
import { DARK, INK, PAPER, SANS } from "@/app/lib/theme";

// Ağlar arası geçiş: header'ın altında ince, köşeli, eşit genişlikte
// dikdörtgenler. Bulunulan ağ dolgulu (aktif) gösterilir, diğerleri o ağın ana
// sayfasına link verir. Robinhood sayfası koyu temada → variant="dark".
// art: kutunun sağına yaslanan görsel. Görsel SABİT boyutta çizilir (yükseklik
// = kutu yüksekliği, genişlik oranından gelir) — kutu daralıp genişlese de
// görsel esnemez/ezilmez; sadece solundaki boş alan değişir, fazlası kırpılır.
// Dosya yoksa background-image sessizce boş kalır (kırık ikon çıkmaz).
const NETWORKS = [
  { key: "base", label: "/base", href: "/", dot: "#0052FF", art: "/networks/base.jpg" },
  { key: "robinhood", label: "/robinhood", href: "/robinhood", dot: "#00C805", art: "/networks/robinhood.jpg" },
  { key: "ethereum", label: "/ethereum", href: "/ethereum", dot: "#627EEA", art: "/networks/ethereum.jpg" },
] as const;

// Görselin sabit genişliği (56px yükseklikte oranı ~3.6:1) ve sol kenar erimesi
const ART_W = 200;
const ART_MASK = "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.35) 30%, #000 65%)";

export type NetworkKey = (typeof NETWORKS)[number]["key"];

const PALETTES = {
  light: {
    text: INK,
    bg: PAPER,
    border: "border-[#D9D4CA] hover:border-[#1A1A1A]",
    activeBorder: "border-[#1A1A1A]",
  },
  dark: {
    text: DARK.INK,
    bg: DARK.PLINTH,
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
    // Telefonda görsel yok → kutu eski ince boyuna (32px) döner
    <nav
      aria-label="Networks"
      className="grid grid-cols-3 gap-2 pt-5 lg:pt-6 [--tile-h:32px] sm:[--tile-h:56px]"
    >
      {NETWORKS.map((n) => {
        const active = n.key === current;
        const tile = (
          <>
            {/* Görsel: yükseklik sabit (TILE_H), genişlik "auto" → oran korunur,
                sağa yaslı. Kutu dar kalırsa görselin solu kırpılır, asla ezilmez. */}
            {/* Görselin kendisi sola doğru şeffaflaşır (mask) — ayrı bir renk
                katmanı yok, böylece görselin kendi zemini ile kutu zemini
                arasında dikey "kesik" çizgi oluşmaz. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 hidden sm:block"
              style={{
                width: ART_W,
                maxWidth: "70%",
                backgroundImage: `url(${n.art})`,
                backgroundSize: "auto 100%",
                backgroundPosition: "right center",
                backgroundRepeat: "no-repeat",
                WebkitMaskImage: ART_MASK,
                maskImage: ART_MASK,
              }}
            />
            <span aria-hidden className="relative shrink-0" style={{ width: 6, height: 6, backgroundColor: n.dot }} />
            <span className="relative truncate" style={{ ...SANS, fontSize: 13, fontWeight: 600, letterSpacing: "0.01em", color: p.text }}>
              {n.label}
            </span>
            {/* Aktif ağ: alt kenarda ağın renginde ince çizgi */}
            {active && <span aria-hidden className="absolute left-0 right-0 bottom-0" style={{ height: 2, backgroundColor: n.dot }} />}
          </>
        );
        const base = "relative overflow-hidden flex items-center justify-center sm:justify-start gap-2 px-2 sm:px-4 min-w-0 border";
        const style = { height: "var(--tile-h)", borderRadius: 2, backgroundColor: p.bg } as const;
        return active ? (
          <div key={n.key} aria-current="page" className={`${base} ${p.activeBorder}`} style={style}>
            {tile}
          </div>
        ) : (
          // Pasif kutuların kenarı class'ta — hover'da koyulaşsın diye
          <Link key={n.key} href={n.href} className={`${base} ${p.border} transition-colors duration-200`} style={style}>
            {tile}
          </Link>
        );
      })}
    </nav>
  );
}
