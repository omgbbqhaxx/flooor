import Link from "next/link";
import { HoloFrame } from "@/app/components/HoloFrame";
import { HAIRLINE, MUTED, PLINTH, SERIF, smallCaps } from "@/app/lib/theme";

// Ethereum koleksiyonları — ana sayfadaki "Explore other collections" kartlarının
// aynısı. Her sayfa kendisini `current` ile listeden çıkarır.
const COLLECTIONS = [
  {
    name: "Nouns",
    sub: "Ethereum · Nouns DAO",
    img: "/nouns-eth/noun-0.svg",
    href: "/ethereum",
    pixelated: true,
  },
  {
    name: "Loot",
    sub: "Ethereum · Adventurer gear",
    img: "/loot/bag-1.svg",
    href: "/ethereum/loot",
    pixelated: false,
  },
  {
    name: "Mutant Ape Yacht Club",
    sub: "Ethereum · Yuga Labs",
    img: "/mayc/mutant-1.png",
    href: "/ethereum/mayc",
    pixelated: false,
  },
  {
    name: "Bored Ape Yacht Club",
    sub: "Ethereum · Yuga Labs",
    img: "/bayc/ape-1.png",
    href: "/ethereum/bayc",
    pixelated: false,
  },
  {
    name: "Alien Frens",
    sub: "Ethereum · Planet Fren",
    img: "/afrens/fren-1.png",
    href: "/ethereum/afrens",
    pixelated: false,
  },
  {
    name: "CryptoPunks",
    sub: "Ethereum · Larva Labs",
    img: "/punks/punk-0.svg",
    href: "/ethereum/punks",
    pixelated: true,
  },
];

export default function EthereumCollections({ current }: { current: string }) {
  const items = COLLECTIONS.filter((col) => col.href !== current);
  return (
    <div className="mt-20 pt-14" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
      <h2
        style={{
          ...SERIF,
          fontSize: "clamp(26px, 3vw, 36px)",
          fontWeight: 500,
        }}
      >
        Explore other Ethereum collections
      </h2>
      <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-5 sm:gap-7">
        {items.map((col) => (
          <Link key={col.name} href={col.href} className="block card-zoom">
            <div
              className="relative aspect-square overflow-hidden"
              style={{
                backgroundColor: PLINTH,
                border: `1px solid ${HAIRLINE}`,
                borderRadius: 16,
                boxShadow: "0 6px 18px rgba(26, 26, 26, 0.05)",
              }}
            >
              <HoloFrame
                className="w-full h-full"
                overlay={
                  // Etiketler altta — Loot görselinin metni sol üstte başlıyor
                  <div className="absolute inset-x-3 bottom-3 flex justify-between">
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
                      Ethereum
                    </span>
                    <span
                      style={{
                        ...smallCaps,
                        color: "#fff",
                        fontSize: 9,
                        padding: "4px 9px",
                        backgroundColor: "rgba(30,123,79,0.85)",
                        backdropFilter: "blur(6px)",
                      }}
                    >
                      Live →
                    </span>
                  </div>
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={col.img}
                  alt={col.name}
                  className="w-full h-full"
                  style={{
                    objectFit: "cover",
                    imageRendering: col.pixelated ? "pixelated" : undefined,
                  }}
                />
              </HoloFrame>
            </div>
            <p
              className="mt-3"
              style={{ ...SERIF, fontWeight: 500, fontSize: "17px" }}
            >
              {col.name}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: MUTED }}>
              {col.sub}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
