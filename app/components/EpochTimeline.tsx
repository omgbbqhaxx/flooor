import { GOLD, GREEN, HAIRLINE, INK, MUTED, smallCaps } from "@/app/lib/theme";

const DAY_SECONDS = 24 * 60 * 60;
const SIGN_SECONDS = 16 * 60 * 60;

export function EpochTimeline({ phase, remainingSeconds }: {
  phase: "sign" | "claim" | null;
  remainingSeconds: number;
}) {
  const phaseEnd = phase === "sign" ? SIGN_SECONDS : DAY_SECONDS;
  const elapsed = Math.min(DAY_SECONDS, Math.max(
    phase === "claim" ? SIGN_SECONDS : 0,
    phaseEnd - Math.max(0, remainingSeconds),
  ));
  const position = elapsed / DAY_SECONDS * 100;
  const signOpen = phase === "sign";
  const claimOpen = phase === "claim";

  return (
    <div className="mt-4">
      <div className="grid grid-cols-[2fr_1fr] gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span style={{ color: signOpen ? GREEN : INK, fontWeight: 600 }}>Sign · 16h</span>
          <span style={{ color: MUTED }}>{phase ? signOpen ? "Open" : "Closed" : "—"}</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right">
          <span style={{ color: claimOpen ? GOLD : INK, fontWeight: 600 }}>Claim · 8h</span>
          <span style={{ color: MUTED }}>{phase ? claimOpen ? "Open" : "Locked" : "—"}</span>
        </div>
      </div>
      <div className="relative mt-8"
        role={phase ? "progressbar" : undefined}
        aria-label="Daily sign and claim cycle"
        aria-valuemin={phase ? 0 : undefined}
        aria-valuemax={phase ? 24 : undefined}
        aria-valuenow={phase ? elapsed / 3600 : undefined}
        aria-valuetext={phase ? `${(elapsed / 3600).toFixed(1)} of 24 hours. ${signOpen ? "Sign open; claim locked" : "Sign closed; claim open"}.` : undefined}>
        {phase && <>
          <span className="absolute -top-5 text-[9px] font-semibold tracking-widest uppercase"
            style={{ color: INK, left: `${Math.min(96, Math.max(4, position))}%`, transform: "translateX(-50%)" }}>Now</span>
          <span className="absolute top-1/2 z-10 h-3.5 w-3.5 rounded-full"
            style={{ left: `${position}%`, transform: "translate(-50%, -50%)", backgroundColor: INK, border: "2px solid #F2ECE0" }} />
        </>}
        <div className="grid grid-cols-[2fr_1fr] gap-1 overflow-hidden rounded-full h-2.5" style={{ backgroundColor: HAIRLINE }}>
          <div style={{ backgroundColor: GREEN, opacity: signOpen ? 1 : 0.3 }} />
          <div style={{ backgroundColor: GOLD, opacity: claimOpen ? 1 : 0.3 }} />
        </div>
      </div>
      <div className="relative mt-2 h-4" style={{ ...smallCaps, fontSize: 9, letterSpacing: "0.03em" }}>
        <span className="absolute left-0">00:00 UTC</span>
        <span className="absolute" style={{ left: "66.6667%", transform: "translateX(-50%)" }}>16:00</span>
        <span className="absolute right-0">24:00</span>
      </div>
    </div>
  );
}
