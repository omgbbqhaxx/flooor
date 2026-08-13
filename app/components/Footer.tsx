import Image from "next/image";

const MUTED = "#75716A";
const FAINT = "#A8A39B";
const HAIRLINE = "#E6E2DA";
const GOLD = "#A4863D";

const SERIF = { fontFamily: "var(--font-serif)" } as const;
const SANS = { fontFamily: "var(--font-sans)" } as const;

const smallCaps = {
  ...SANS,
  fontSize: "11px",
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: MUTED,
} as const;

const linkStyle = {
  ...SANS,
  fontSize: "14px",
  color: MUTED,
} as const;

export default function Footer({
  contractAddr,
}: {
  contractAddr: string;
}) {
  return (
    <footer style={{ borderTop: `1px solid ${HAIRLINE}`, marginTop: "80px" }}>
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 grid grid-cols-2 md:grid-cols-4 gap-10">
        <div className="col-span-2 md:col-span-1">
          <p style={{ ...SERIF, fontWeight: 500, fontSize: "22px" }}>Flooor</p>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: MUTED }}>
            5% royalty accumulates in the daily vault and splits evenly among everyone who signs during the 16-hour sign phase — claim your share during the 8-hour claim phase.
          </p>
        </div>
        <div>
          <p style={smallCaps}>Protocol</p>
          <div className="mt-4 flex flex-col gap-2.5">
            <a
              href="https://vrnouns.gitbook.io/flooor/documentation/documentation-en"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
              style={linkStyle}
            >
              Documentation
            </a>
            <a
              href="https://github.com/omgbbqhaxx/flooor"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
              style={linkStyle}
            >
              GitHub
            </a>
            <a
              href="https://snapshot.org/#/s:vrnouns.eth"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
              style={linkStyle}
            >
              Snapshot DAO
            </a>
            <a
              href="https://defillama.com/protocol/flooor.fun"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
              style={linkStyle}
            >
              DefiLlama
            </a>
          </div>
        </div>
        <div>
          <p style={smallCaps}>Contracts</p>
          <div className="mt-4 flex flex-col gap-2.5">
            <a
              href="https://basescan.org/address/0xbb56a9359df63014b3347585565d6f80ac6305fd#readContract"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
              style={linkStyle}
            >
              VRNouns
            </a>
            <a
              href={`https://basescan.org/address/${contractAddr}#readContract`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
              style={linkStyle}
            >
              Flooor
            </a>
            <a
              href="https://opensea.io/collection/vrnouns"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
              style={linkStyle}
            >
              OpenSea
            </a>
          </div>
        </div>
        <div>
          <p style={smallCaps}>Social</p>
          <div className="mt-4 flex flex-col gap-2.5">
            <a
              href="https://x.com/vrnouns"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
              style={linkStyle}
            >
              X / Twitter
            </a>
            <a
              href="https://t.me/richkidsofun"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
              style={linkStyle}
            >
              Telegram
            </a>
            <a
              href="https://farcaster.xyz/miniapps/pIFtRBsgnWAF/flooorfun"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
              style={linkStyle}
            >
              Farcaster
            </a>
            <a
              href="https://base.app/app/flooor.fun"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
              style={linkStyle}
            >
              Base App
            </a>
          </div>
        </div>
      </div>
      <div
        className="relative py-6 px-5 sm:px-20 text-center overflow-hidden"
        style={{ borderTop: `1px solid ${HAIRLINE}` }}
      >
        <Image
          src="/left-adorn.png"
          alt=""
          aria-hidden="true"
          width={64}
          height={64}
          className="hidden sm:block absolute left-2 md:left-8 bottom-0 w-16 h-auto pointer-events-none select-none"
        />
        <p
          style={{
            ...SERIF,
            fontStyle: "italic",
            fontSize: "15px",
            color: GOLD,
            letterSpacing: "0.08em",
          }}
        >
          MMXXVI
        </p>
        <p className="mt-2 text-xs" style={{ color: FAINT }}>
          © flooor.fun · CC0 Licensed · Front-end v3.0.127 · Contract v1.0 ·
          Beta · Crafted with Claude Fable 5
        </p>
        <Image
          src="/right-adorn.png"
          alt=""
          aria-hidden="true"
          width={64}
          height={64}
          className="hidden sm:block absolute right-2 md:right-8 bottom-0 w-16 h-auto pointer-events-none select-none"
        />
      </div>
    </footer>
  );
}
