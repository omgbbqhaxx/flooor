import Link from "next/link";
import { HoloFrame } from "@/app/components/HoloFrame";
import { HAIRLINE, MUTED, PLINTH, SERIF } from "@/app/lib/theme";

// Ethereum koleksiyonları — ana sayfadaki "Explore other collections" kartlarının
// aynısı. Her sayfa kendisini `current` ile listeden çıkarır.
const COLLECTIONS = [
  {
    name: "CryptoPunks",
    sub: "Ethereum · Larva Labs",
    img: "/punks/punk-0.svg",
    href: "/ethereum/punks",
    pixelated: true,
  },
  {
    name: "Pudgy Penguins",
    sub: "Ethereum · Igloo Inc.",
    img: "/pudgy/penguin-1.png",
    href: "/ethereum/pudgy",
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
    name: "Mutant Ape Yacht Club",
    sub: "Ethereum · Yuga Labs",
    img: "/mayc/mutant-1.png",
    href: "/ethereum/mayc",
    pixelated: false,
  },
  {
    name: "Doodles",
    sub: "Ethereum · Burnt Toast",
    img: "/doodles/doodle-1.png",
    href: "/ethereum/doodles",
    pixelated: false,
  },
  {
    name: "Nouns",
    sub: "Ethereum · Nouns DAO",
    img: "/nouns-eth/noun-0.svg",
    href: "/ethereum",
    pixelated: true,
  },
  {
    name: "Alien Frens",
    sub: "Ethereum · Planet Fren",
    img: "/afrens/fren-1.png",
    href: "/ethereum/afrens",
    pixelated: false,
  },
  // Loot şimdilik listeden kaldırıldı (sayfa /ethereum/loot yerinde duruyor)
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
          <Link key={col.name} href={col.href} className="group block card-zoom">
            {/* Galeri kaidesi: etiketsiz eser, ince çerçeve, gölge yok */}
            <div
              className="relative aspect-square overflow-hidden transition-colors duration-500"
              style={{
                backgroundColor: PLINTH,
                border: `1px solid ${HAIRLINE}`,
                borderRadius: 4,
              }}
            >
              <HoloFrame className="w-full h-full">
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
            {/* Katalog künyesi: sadece eser adı + hover'da kayan ok; zincir etiketi yok */}
            <div
              className="mt-4 pb-3 flex items-baseline justify-between gap-3"
              style={{ borderBottom: `1px solid ${HAIRLINE}` }}
            >
              <p style={{ ...SERIF, fontWeight: 500, fontSize: "18px", lineHeight: 1.25 }}>
                {col.name}
              </p>
              <span
                aria-hidden
                className="shrink-0 transition-transform duration-500 ease-out group-hover:translate-x-1"
                style={{ ...SERIF, fontSize: "16px", color: MUTED }}
              >
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
