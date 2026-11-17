import { FAINT, GREEN, HAIRLINE, INK, MUTED, SANS, SERIF, smallCaps } from "@/app/lib/theme";

// Eser görselinin altındaki günlük metrikler — müzayede kataloğu düzeninde:
// üstte günün treasury'si serif rakamla, altında ince çizgilerle ayrılmış
// dört sütun. Hap/rozet yok; sadece small caps etiket + rakam.
type Metric = { label: string; value: string; sub?: string | null; green?: boolean };

export default function LotStats({
  treasury,
  treasuryUsd,
  metrics,
}: {
  treasury: string;
  treasuryUsd?: string | null;
  metrics: Metric[];
}) {
  const label = { ...smallCaps, fontSize: 9, letterSpacing: "0.16em" } as const;
  return (
    <div className="px-5 pt-4 pb-5" style={{ borderTop: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}` }}>
      <div className="flex items-baseline justify-between gap-3">
        <span style={label}>Daily Treasury</span>
        <span
          title="5% of every sale goes to the daily treasury, shared by everyone who signs that day"
          style={{ ...label, color: FAINT }}
        >
          5% of every sale
        </span>
      </div>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 tabular-nums">
        <span style={{ ...SERIF, fontWeight: 500, fontSize: 30, lineHeight: 1.1, color: INK }}>{treasury}</span>
        {treasuryUsd && <span className="text-sm" style={{ ...SANS, color: MUTED }}>{treasuryUsd}</span>}
      </p>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
        {metrics.map((m, i) => (
          <div
            key={m.label}
            // Mobilde 2×2 (sağ sütunda sol çizgi), sm ve üstünde tek sıra 4 sütun
            className={`min-w-0 pt-3 ${i % 2 === 1 ? "pl-3 border-l" : "pr-3 border-l-0"} sm:px-3 ${i === 0 ? "sm:pl-0" : "sm:border-l"} ${i >= 2 ? "mt-3 sm:mt-0" : ""}`}
            style={{ borderColor: HAIRLINE }}
          >
            <p style={{ ...label, fontSize: 8 }}>{m.label}</p>
            <p className="mt-1.5 text-[13px] tabular-nums break-words" style={{ ...SANS, fontWeight: 500, color: m.green ? GREEN : INK }}>
              {m.value}
            </p>
            {m.sub && <p className="mt-0.5 text-[11px] tabular-nums" style={{ ...SANS, color: FAINT }}>{m.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
