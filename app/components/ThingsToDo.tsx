import type { ReactNode } from "react";
import { HAIRLINE, INK, MUTED, SANS, SERIF, smallCaps } from "@/app/lib/theme";

// "All NFT holders win together." bandının altındaki bağlantı vitrini.
// Galeri kataloğu düzeni: köşeli kartlar, ince çizgiler, serif başlıklar.
// Linkleri değiştirmek için sadece aşağıdaki LINKS nesnesini düzenle.
const LINKS = {
  wallet: "https://www.coinbase.com/wallet/downloads",
  telegram: "https://t.me/richkidsofun",
  baseApp: "https://base.app/app/flooor.fun",
  farcaster: "https://farcaster.xyz/miniapps/pIFtRBsgnWAF/flooorfun",
  x: "https://x.com/flooorfun",
  docs: "https://vrnouns.gitbook.io/flooor/documentation/documentation-en",
  governance: "https://snapshot.org/#/s:vrnouns.eth",
  analytics: "https://dune.com/yasinaktimur/flooor",
  source: "https://github.com/omgbbqhaxx/flooor",
} as const;

const CARD = { border: `1px solid ${HAIRLINE}`, backgroundColor: "rgba(255,255,255,0.35)" } as const;
const TITLE = { ...SERIF, fontWeight: 500, fontSize: 22, lineHeight: 1.25, color: INK } as const;

function Ext({ href, children, className = "", style }: { href: string; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style}>
      {children}
    </a>
  );
}

// Dolgu buton: renkli, kare
function SolidButton({ href, bg, children }: { href: string; bg: string; children: ReactNode }) {
  return (
    <Ext
      href={href}
      className="inline-flex items-center justify-center gap-2.5 px-6 py-3 transition-opacity hover:opacity-85"
      style={{ ...smallCaps, color: "#fff", backgroundColor: bg }}
    >
      {children}
    </Ext>
  );
}

// Çerçeveli buton: hairline, kare
function LineButton({ href, children, full = false }: { href: string; children: ReactNode; full?: boolean }) {
  return (
    <Ext
      href={href}
      className={`${full ? "flex w-full" : "inline-flex"} items-center justify-center gap-2 px-5 py-2.5 transition-colors hover:bg-black hover:text-white`}
      style={{ ...smallCaps, color: INK, border: `1px solid ${INK}` }}
    >
      {children}
    </Ext>
  );
}

const TelegramIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.3 13 1.5 11.5c-1-.3-1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5z" />
  </svg>
);

const WalletIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" stroke="currentColor" strokeWidth="2" />
    <rect x="9" y="9" width="6" height="6" fill="currentColor" />
  </svg>
);

const RESOURCES = [
  { mark: "§", label: "Docs", note: "How the market works", href: LINKS.docs },
  { mark: "Ⅴ", label: "Governance", note: "Vote on Snapshot", href: LINKS.governance },
  { mark: "%", label: "Analytics", note: "Live data on Dune", href: LINKS.analytics },
  { mark: "{ }", label: "Source", note: "Open code on GitHub", href: LINKS.source },
];

export default function ThingsToDo() {
  return (
    <section id="things" className="max-w-6xl mx-auto px-5 sm:px-8 mt-16 sm:mt-20 text-left">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 1 — Protokol kaynakları, 2×2 */}
        <div className="flex flex-col" style={CARD}>
          <div className="px-6 pt-6 pb-5" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
            <h3 style={TITLE}>Know the protocol</h3>
            <p className="mt-1.5 text-sm" style={{ ...SANS, color: MUTED }}>Everything behind the market, in the open.</p>
          </div>
          <div className="grid grid-cols-2 flex-1">
            {RESOURCES.map((r, i) => (
              <Ext
                key={r.label}
                href={r.href}
                className="group flex flex-col items-center justify-center text-center px-3 py-7 transition-colors hover:bg-white/50"
                style={{
                  borderLeft: i % 2 === 1 ? `1px solid ${HAIRLINE}` : undefined,
                  borderTop: i >= 2 ? `1px solid ${HAIRLINE}` : undefined,
                }}
              >
                <span style={{ ...SERIF, fontSize: 34, lineHeight: 1, color: INK }}>{r.mark}</span>
                <span className="mt-4 underline-offset-4 group-hover:underline" style={{ ...smallCaps, color: INK }}>{r.label} →</span>
                <span className="mt-1 text-[11px]" style={{ ...SANS, color: MUTED }}>{r.note}</span>
              </Ext>
            ))}
          </div>
        </div>

        {/* 2 — Telegram + cüzdan, alt alta */}
        <div className="flex flex-col gap-5">
          <div className="flex-1 p-6 flex flex-col" style={{ ...CARD, backgroundColor: "rgba(41,159,213,0.07)" }}>
            <h3 style={TITLE}>Join the Telegram</h3>
            <p className="mt-2 text-sm" style={{ ...SANS, color: MUTED }}>Meet other holders, ask anything, hear about new collections first.</p>
            <div className="mt-auto pt-6">
              <SolidButton href={LINKS.telegram} bg="#229ED9"><TelegramIcon /> Join Telegram</SolidButton>
            </div>
          </div>
          <div className="flex-1 p-6 flex flex-col" style={{ ...CARD, backgroundColor: "rgba(0,82,255,0.06)" }}>
            <h3 style={TITLE}>Get Coinbase Wallet</h3>
            <p className="mt-2 text-sm" style={{ ...SANS, color: MUTED }}>The simplest way onto Base — sign daily and claim in a single tap.</p>
            <div className="mt-auto pt-6">
              <SolidButton href={LINKS.wallet} bg="#0052FF"><WalletIcon /> Download wallet</SolidButton>
            </div>
          </div>
        </div>

        {/* 3 — Uygulamalarda Flooor, uzun kart + eser */}
        <div className="flex flex-col overflow-hidden" style={CARD}>
          <div className="p-6">
            <h3 style={TITLE}>Flooor in your pocket</h3>
            <p className="mt-2 text-sm" style={{ ...SANS, color: MUTED }}>Open the market as a mini app, and follow along for daily drops.</p>
            <div className="mt-5 flex flex-col gap-2.5">
              <LineButton href={LINKS.baseApp} full>Open in Base App →</LineButton>
              <LineButton href={LINKS.farcaster} full>Open on Farcaster →</LineButton>
              <LineButton href={LINKS.x} full>Follow on X →</LineButton>
            </div>
          </div>
          <div className="mt-auto flex justify-center px-6 pt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vrnounz.svg" alt="VRNoun" width={220} height={220} className="block w-[200px] h-auto" style={{ imageRendering: "pixelated" }} />
          </div>
        </div>
      </div>
    </section>
  );
}
