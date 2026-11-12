// Apple-style palette, scoped to /ethereum only — shared by the landing page
// and the Nouns market section.
export const WHITE = "#FFFFFF";
export const SNOW = "#F5F5F7";
export const TEXT = "#1D1D1F";
export const SUBTLE = "#6E6E73";
export const FAINT = "#86868B";
export const LINK = "#0071E3";
export const LIVE_GREEN = "#1E7B4F";

export const SANS = { fontFamily: "var(--font-sans)" } as const;
export const HEADLINE = { ...SANS, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.06 } as const;
export const EYEBROW = { ...SANS, fontSize: "14px", fontWeight: 600, color: SUBTLE } as const;

// Nouns on Ethereum mainnet (nouns.wtf) and its flooor market.
export const NOUNS_TOKEN = "0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03" as const;
export const NOUNS_MARKET = "0xefa16aadbaa124b0e5bceabef29d78a02f1ff528" as const;
