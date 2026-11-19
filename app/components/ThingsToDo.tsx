import type { ReactNode } from "react";
import { STOCK } from "@/app/lib/claimAsStock";
import { GOLD, INK, PAPER, MUTED, SANS, SERIF, smallCaps } from "@/app/lib/theme";

// "All NFT holders win together." bandının altındaki bağlantı vitrini.
// Galeri kataloğu düzeni: köşeli kartlar, ince çizgiler, serif başlıklar.
// Linkleri değiştirmek için sadece aşağıdaki LINKS nesnesini düzenle.
const LINKS = {
  wallet: "https://wallet.coinbase.com/invite/flooorfunprotocolfee/X57CH6Y2",
  telegram: "https://t.me/+-utsFlsY2xtkODFk",
  baseMarkets: "https://www.base.org/markets/stocks",
  widget: "https://flooor.notion.site/iPhone-widget-41b0e53baa7d808f97f7e92c51b3d881",
  defillama: "https://defillama.com/protocols/nft-marketplace",
  antc: "https://basescan.org/token/0xb20000000000000000000016e38fd364d271ba28",
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
function SolidButton({ href, bg, color = "#fff", glow, children }: { href: string; bg: string; color?: string; glow?: string; children: ReactNode }) {
  return (
    <Ext
      href={href}
      className="inline-flex items-center justify-center gap-2.5 px-6 py-3 transition-transform duration-200 ease-out hover:scale-[1.04]"
      style={{ ...smallCaps, color, background: bg, boxShadow: glow }}
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
          {/* Coinbase Wallet kampanya görselinin havası, CSS ile: koyu lacivert gece,
              alt kenardan doğan mavi-camgöbeği gezegen yayı. Görselin kendi yazısı
              kartın metniyle çakışacağı için resim yerine gradyan. */}
          <div
            className="relative flex-1 p-6 flex flex-col overflow-hidden"
            style={{ border: "1px solid #1F2A3D", backgroundColor: "#0F1726", color: "#fff" }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 -translate-x-1/2"
              style={{
                top: "74%",
                width: "210%",
                aspectRatio: "1",
                borderRadius: "50%",
                background: "radial-gradient(circle closest-side, #0A1E6E 0%, #0B35B8 74%, #0E7FE6 89%, #16D4F5 96%, #7CF7D0 100%)",
                boxShadow: "0 0 6px 1px rgba(124,247,208,0.9), 0 0 34px 8px rgba(22,212,245,0.42)",
                filter: "blur(1.5px)",
              }}
            />
            <h3 className="relative" style={{ ...TITLE, color: "#fff" }}>
              Get <span style={{ color: "#16D4F5" }}>Coinbase Wallet</span>
            </h3>
            <p className="relative mt-2 text-sm" style={{ ...SANS, color: "#fff" }}>The simplest way onto Base — sign daily and claim in a single tap.</p>
            <div className="relative mt-5 pb-10">
              <SolidButton
                href={LINKS.wallet}
                // Coinbase logosundaki mavi → camgöbeği geçiş, altında yumuşak parıltı
                bg="linear-gradient(90deg, #0052FF 0%, #1A7CFF 45%, #16D4F5 100%)"
                glow="0 8px 22px -8px rgba(22,212,245,0.75), inset 0 1px 0 rgba(255,255,255,0.25)"
              ><WalletIcon /> Download wallet</SolidButton>
            </div>
          </div>
        </div>

        {/* 3 — Tokenized stock: günlük payı STOCK (şu an ANTc, tokenized Anthropic) olarak alma. */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ ...CARD, background: "linear-gradient(180deg, #F2EEE8 0%, #ECE5DA 100%)" }}
        >
          <div className="p-6 pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <h3 style={TITLE}>Claim as stock</h3>
              <span style={{ ...smallCaps, fontSize: 9, color: GOLD }}>Tokenized</span>
            </div>
            <p className="mt-2 text-sm" style={{ ...SANS, color: MUTED }}>
              Take your daily share as {STOCK.symbol} — tokenized {STOCK.name} stock on Base, swapped in the same
              transaction via Aerodrome. One tap, no extra step.
            </p>
            <div className="mt-5">
              <LineButton href={LINKS.baseMarkets} full>View Base Markets →</LineButton>
            </div>
          </div>
          {/* Görsel yerine katalog etiketi: hisse sembolü serif, altında cashtag.
              Token değişince kendiliğinden güncellenir. */}
          <div className="mt-auto px-6 pt-8 pb-6">
            <div className="flex flex-col items-center justify-center py-10" style={{ borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
              <span style={{ ...smallCaps, fontSize: 9, color: MUTED }}>Lot · Tokenized equity</span>
              <span className="mt-3" style={{ ...SERIF, fontWeight: 500, fontSize: 56, lineHeight: 1, color: INK }}>{STOCK.symbol}</span>
              <span className="mt-3" style={{ ...SERIF, fontStyle: "italic", fontSize: 17, color: INK }}>{STOCK.name}</span>
              <span className="mt-2" style={{ ...smallCaps, fontSize: 10, color: GOLD }}>{STOCK.cashtag} · on Base</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alt sıra: iki yatay duyuru kartı */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        {/* 4 — DefiLlama sıralaması: NFT Marketplace kategorisinde 10., hedef 1. */}
        <div className="p-6 flex flex-col" style={{ ...CARD, backgroundColor: "#EFE6CC", borderColor: "#D9C99B" }}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 style={TITLE}>#10 on DefiLlama</h3>
            <span style={{ ...smallCaps, fontSize: 9, color: GOLD }}>NFT Marketplaces</span>
          </div>
          <p className="mt-2 text-sm" style={{ ...SANS, color: MUTED }}>
            Flooor is now ranked 10th among NFT marketplaces on DefiLlama. Every sign, bid and sale moves us up —
            the goal is #1, with royalties going back to the community.
          </p>
          <div className="mt-auto pt-6">
            <LineButton href={LINKS.defillama}>See the ranking →</LineButton>
          </div>
        </div>

        {/* 5 — Anthropic (ANTc) canlı: NFT sahipleri günlük payı ANTc olarak claim eder */}
        <div className="p-6 flex flex-col" style={{ ...CARD, backgroundColor: "#F5E6D8", borderColor: "#E0C4AA" }}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 style={TITLE}>Anthropic is live</h3>
            <span style={{ ...smallCaps, fontSize: 9, color: "#A9532A" }}>{STOCK.cashtag} · Live now</span>
          </div>
          <p className="mt-2 text-sm" style={{ ...SANS, color: MUTED }}>
            {STOCK.symbol}, tokenized {STOCK.name} stock, is now on Base. NFT holders can claim their daily vault
            share as {STOCK.symbol} — swapped in the same transaction, one tap.
          </p>
          <div className="mt-auto pt-6">
            <SolidButton href={LINKS.antc} bg="#A9532A">View {STOCK.symbol} on Base →</SolidButton>
          </div>
        </div>
      </div>
    </section>
  );
}
