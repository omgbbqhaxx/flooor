// ============================================================================
// SITE THEME — the single source of truth for colours and type.
//
// Every page and component imports from here. Changing a colour below changes
// it everywhere (header, cards, footer, all collection pages). The only places
// that cannot import TypeScript are app/globals.css and the <html> background
// in app/layout.tsx — keep PAPER in sync there if it ever changes.
// ============================================================================

/** Page and surface background (was pure white; warm paper is easier on the eyes). */
export const PAPER = "#F2ECE0";
/** Slightly darker tint for card headers, idle buttons and section bands. */
export const IVORY = "#EAE2D2";
export const PLINTH = "#F1EEE8";
export const INK = "#1A1A1A";
export const MUTED = "#75716A";
export const FAINT = "#A8A39B";
export const HAIRLINE = "#E6E2DA";
export const GREEN = "#1E7B4F";
export const GOLD = "#A4863D";
export const RED = "#9A2D2D";
export const AMBER = "#A9731E";

/** Translucent header over PAPER, blurred. */
export const HEADER_BG = "rgba(242,236,224,0.92)";

/** Dark variant used by the Robinhood collection. */
export const DARK = {
  INK: "#F2F2ED",
  MUTED: "#9B9B93",
  HAIRLINE: "#262626",
  IVORY: "#0B0B0C",
  PLINTH: "#141414",
  GREEN: "#3DDC84",
  GOLD: "#CDFF00",
  FAINT: "#5C5C55",
  HEADER_BG: "rgba(11,11,12,0.85)",
} as const;

export const SERIF = { fontFamily: "var(--font-serif)" } as const;
export const SANS = { fontFamily: "var(--font-sans)" } as const;

export const smallCapsFor = (color: string) =>
  ({
    ...SANS,
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color,
  }) as const;

export const smallCaps = smallCapsFor(MUTED);
