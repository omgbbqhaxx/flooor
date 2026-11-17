import type { ReactNode } from "react";
import { GOLD, INK, PAPER, MUTED, SANS, SERIF, smallCaps } from "@/app/lib/theme";

// "All NFT holders win together." bandının altındaki bağlantı vitrini.
// Galeri kataloğu düzeni: köşeli kartlar, ince çizgiler, serif başlıklar.
// Linkleri değiştirmek için sadece aşağıdaki LINKS nesnesini düzenle.
const LINKS = {
  wallet: "https://wallet.coinbase.com/invite/flooorfunprotocolfee/X57CH6Y2",
  telegram: "https://t.me/+-utsFlsY2xtkODFk",
  baseApp: "https://base.app/app/flooor.fun",
  farcaster: "https://farcaster.xyz/miniapps/pIFtRBsgnWAF/flooorfun",
  x: "https://x.com/flooorfun",
  widget: "https://flooor.notion.site/iPhone-widget-41b0e53baa7d808f97f7e92c51b3d881",
} as const;

// degods.com "Things to do" ölçüleri, bizim paletimize çevrildi: bant IVORY,
// kart ondan bir ton açık (PAPER), dış çerçeve banttan bir ton koyu,
// kart içi ayraçlar %10 siyah. Gölge ve köşe yuvarlatma yok.
const LINE = "rgba(26,26,26,0.1)";
const CARD = { border: "1px solid #CFC5B2", backgroundColor: PAPER } as const;
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
      className="inline-flex items-center justify-center gap-2.5 px-6 py-3 transition-transform duration-200 ease-out hover:scale-[1.04]"
      style={{ ...smallCaps, color: "#fff", backgroundColor: bg }}
    >
      {children}
    </Ext>
  );
}

// Çerçeveli buton: hairline, kare. Hover'da renk değişmez, sadece hafifçe büyür
function LineButton({ href, children, full = false }: { href: string; children: ReactNode; full?: boolean }) {
  return (
    <Ext
      href={href}
      className={`${full ? "flex w-full" : "inline-flex"} items-center justify-center gap-2 px-5 py-2.5 transition-transform duration-200 ease-out hover:scale-[1.03]`}
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


export default function ThingsToDo() {
  return (
    <section id="things" className="max-w-6xl mx-auto px-5 sm:px-8 mt-16 sm:mt-20 text-left">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 1 — iPhone widget ekran görüntüsü. Görselin yuvarlak köşelerinin dışı
            koyu gri (#2C2C2E); widget'ın köşe yarıçapıyla (~72px / 1092×1146)
            kırpılıyor ki kart üzerinde koyu leke kalmasın. */}
        <div className="flex flex-col" style={CARD}>
          <div className="px-6 pt-6 pb-5" style={{ borderBottom: `1px solid ${LINE}` }}>
            <h3 style={TITLE}>iPhone Widget</h3>
            <p className="mt-1.5 text-sm" style={{ ...SANS, color: MUTED }}>Treasury, live bid and last sales on your iPhone home screen.</p>
          </div>
          <Ext href={LINKS.widget} className="group flex-1 flex items-center justify-center p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/iphone-widget.jpg"
              alt="Flooor iPhone widget showing the daily treasury, signers, current bid and last sales"
              width={1092}
              height={1146}
              className="block w-full max-w-[300px] h-auto transition-transform duration-500 ease-out group-hover:scale-[1.02]"
              style={{ borderRadius: "6.8% / 6.5%", border: "1px solid rgba(26,26,26,0.12)", boxShadow: "0 10px 28px -14px rgba(26,26,26,0.35)" }}
            />
          </Ext>
          <Ext href={LINKS.widget} className="group flex items-center justify-between gap-3 px-6 py-4" style={{ borderTop: `1px solid ${LINE}` }}>
            <span className="underline-offset-4 group-hover:underline" style={{ ...smallCaps, color: INK }}>Set up the widget →</span>
            <span style={{ ...smallCaps, fontSize: 9, color: GOLD }}>New</span>
          </Ext>
        </div>

        {/* 2 — Telegram + cüzdan, alt alta */}
        <div className="flex flex-col gap-5">
          <div className="flex-1 p-6 flex flex-col" style={{ ...CARD, backgroundColor: "#E5F0E4" }}>
            <h3 style={TITLE}>Join the Telegram</h3>
            <p className="mt-2 text-sm" style={{ ...SANS, color: MUTED }}>Meet other holders, ask anything, hear about new collections first.</p>
            <div className="mt-auto pt-6">
              <SolidButton href={LINKS.telegram} bg={INK}><TelegramIcon /> Join Telegram</SolidButton>
            </div>
          </div>
          <div className="flex-1 p-6 flex flex-col" style={{ ...CARD, backgroundColor: "#DBDDF0" }}>
            <h3 style={TITLE}>Get Coinbase Wallet</h3>
            <p className="mt-2 text-sm" style={{ ...SANS, color: MUTED }}>The simplest way onto Base — sign daily and claim in a single tap.</p>
            <div className="mt-auto pt-6">
              <SolidButton href={LINKS.wallet} bg="#8A6CFF"><WalletIcon /> Download wallet</SolidButton>
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
          {/* Zeminsiz VRNoun: gövdesi kartın alt çizgisine oturur, kare zemin yaması yok */}
          <div className="mt-auto flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vrnoun-cutout.svg" alt="VRNoun" width={260} height={260} className="block w-[240px] h-auto" style={{ imageRendering: "pixelated" }} />
          </div>
        </div>
      </div>
    </section>
  );
}
