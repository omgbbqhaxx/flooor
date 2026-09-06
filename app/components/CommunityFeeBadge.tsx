// 5% royalty rozeti — OpenSea'deki fee pill'ine benzer, tüm koleksiyon
// sayfalarında aynı görünsün diye tek yerden geliyor. Uyarı gibi durmaması
// için altın değil silver tonda. `amount` verilirse rozetin yanında o günkü
// vault bakiyesi dış pill'in içinde ikinci bir pill olarak gösteriliyor.
const SANS = { fontFamily: "var(--font-sans)" } as const;

const TONES = {
  light: {
    color: "#7B7F85",
    backgroundColor: "rgba(123,127,133,0.08)",
    border: "1px solid rgba(123,127,133,0.28)",
    amountColor: "#1A1A1A",
    amountBackground: "rgba(123,127,133,0.14)",
    usdColor: "#1E7B4F",
  },
  dark: {
    color: "#C6C9CE",
    backgroundColor: "rgba(198,201,206,0.10)",
    border: "1px solid rgba(198,201,206,0.28)",
    amountColor: "#F2F2ED",
    amountBackground: "rgba(198,201,206,0.18)",
    usdColor: "#6FD39A",
  },
} as const;

const pill = {
  ...SANS,
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  padding: "4px 12px",
  borderRadius: 999,
} as const;

export default function CommunityFeeBadge({
  tone = "light",
  amount,
  amountUsd,
}: {
  tone?: "light" | "dark";
  amount?: string;
  amountUsd?: string | null;
}) {
  const t = TONES[tone];
  // İç içe küme: dış hap kuralı söyler, içindeki hap o günkü vault bakiyesi —
  // bakiyenin vault'un "içinde" olduğu görsel olarak da okunsun.
  return (
    <span
      title="5% of every sale goes to the daily vault, shared by everyone who signs that day"
      className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
      style={{
        ...pill,
        // Dar ekranda iç hap alt satıra insin, kart taşmasın
        whiteSpace: "normal",
        color: t.color,
        backgroundColor: t.backgroundColor,
        border: t.border,
        padding: amount ? "3px 3px 3px 12px" : pill.padding,
      }}
    >
      <span>{amount ? "5% Community Fee →" : "5% Community Fee → Daily Vault"}</span>
      {amount && (
        <span
          title="Sitting in today's vault right now"
          style={{
            ...pill,
            letterSpacing: "0.08em",
            padding: "3px 10px",
            color: t.color,
            backgroundColor: t.amountBackground,
            border: t.border,
          }}
        >
          Daily Vault
          <span style={{ color: t.amountColor, fontWeight: 600, marginLeft: 6 }}>
            · {amount}
          </span>
          {amountUsd && (
            <span style={{ color: t.usdColor, fontWeight: 600, marginLeft: 6 }}>
              · {amountUsd}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
