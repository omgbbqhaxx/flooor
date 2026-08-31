import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { HoloFrame } from "@/app/components/HoloFrame";
import { buildNftDownload, saveNftImage } from "@/app/lib/nftImage";

const INK = "#1A1A1A";
const MUTED = "#75716A";
const FAINT = "#A8A39B";
const HAIRLINE = "#E6E2DA";
const IVORY = "#F7F5F1";
const GREEN = "#1E7B4F";
const AMBER = "#A9731E";
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

export type WorkCardPrimaryTone = "default" | "ready" | "waiting";

export interface WorkCardProps {
  tokenIdStr: string;
  itemName: string;
  image?: string;
  approved: boolean;
  primaryLabel: string;
  primaryDisabled: boolean;
  primaryTone: WorkCardPrimaryTone;
  onPrimaryClick: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  busy: boolean;
  onSend: () => void;
  hasBid: boolean;
  isArmed: boolean;
  currentBidDisplay: string;
  onSellClick: () => void;
}

export default function WorkCard({
  tokenIdStr,
  itemName,
  image,
  approved,
  primaryLabel,
  primaryDisabled,
  primaryTone,
  onPrimaryClick,
  isExpanded,
  onToggleExpand,
  busy,
  onSend,
  hasBid,
  isArmed,
  currentBidDisplay,
  onSellClick,
}: WorkCardProps) {
  const [downloading, setDownloading] = useState(false);
  // Gorsel hazirligi (fetch / rasterize) uzun surerse iOS kullanici etkilesimini
  // yitiriyor ve paylas sayfasi acilmiyor; parmak degdigi anda hazirlamaya basliyoruz.
  const preparedRef = useRef<{
    src: string;
    task: Promise<{ blob: Blob; ext: string }>;
  } | null>(null);

  const prepare = () => {
    if (!image) return null;
    if (preparedRef.current?.src !== image) {
      const task = buildNftDownload(image);
      // Tiklamadan once reddedilirse "unhandled rejection" olmasin
      task.catch(() => {});
      preparedRef.current = { src: image, task };
    }
    return preparedRef.current.task;
  };

  const handleDownload = async () => {
    if (!image || downloading) return;
    setDownloading(true);
    try {
      const task = prepare();
      if (!task) return;
      const { blob, ext } = await task;
      const result = await saveNftImage(
        blob,
        `${itemName.toLowerCase().replace(/\s+/g, "-")}-${tokenIdStr}.${ext}`,
      );
      if (result === "opened") {
        toast.info("Opened the artwork — press and hold it to save.");
      } else if (result === "failed") {
        toast.error("Your browser blocked the save. Try again from Safari or Chrome.");
      }
    } catch {
      preparedRef.current = null;
      // Dis gorsel CORS/aginda takilirsa kullanici sekmede kendi kaydedebilsin
      if (!image.startsWith("data:")) {
        window.open(image, "_blank", "noopener");
        toast.info("Opened the artwork in a new tab — save it from there.");
      } else {
        toast.error("Could not prepare the image. Please try again.");
      }
    } finally {
      setDownloading(false);
    }
  };

  const primaryColor = primaryDisabled
    ? primaryTone === "waiting"
      ? INK
      : FAINT
    : "#fff";
  const primaryBg = primaryDisabled
    ? primaryTone === "waiting"
      ? "#fff"
      : IVORY
    : primaryTone === "ready"
      ? GREEN
      : INK;
  const primaryBorder = primaryDisabled
    ? `1px solid ${primaryTone === "waiting" ? INK : HAIRLINE}`
    : "none";

  return (
    <article
      data-token-id={tokenIdStr}
      className="flex flex-col work-card"
      style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: "#fff" }}
    >
      {/* Lot line */}
      <div
        className="flex items-center justify-between px-3.5 py-2.5"
        style={{ borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <span className="flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 22 22" aria-hidden="true">
            <path
              fill={GOLD}
              d="M11 0l2.2 1.6 2.6-.7 1.4 2.3 2.6.7.1 2.7 2.1 1.6-1.2 2.4 1.2 2.4-2.1 1.6-.1 2.7-2.6.7-1.4 2.3-2.6-.7L11 22l-2.2-1.6-2.6.7-1.4-2.3-2.6-.7-.1-2.7L0 13.8l1.2-2.4L0 9l2.1-1.6.1-2.7 2.6-.7L6.2.9 8.8 1.6 11 0z"
            />
            <path fill="#fff" d="M9.6 14.9L6.3 11.6l1.1-1.1 2.2 2.2 5-5 1.1 1.1z" />
          </svg>
          <span
            className="tabular-nums"
            style={{ ...SANS, fontSize: 13, fontWeight: 600, color: INK }}
          >
            #{tokenIdStr}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            onPointerDown={prepare}
            disabled={!image || downloading}
            aria-label={`Save ${itemName} #${tokenIdStr} as an image`}
            title={image ? "Save image" : "Artwork not loaded yet"}
            className="-my-2 -mr-1 flex items-center justify-center transition-colors enabled:hover:text-black disabled:opacity-40"
            style={{
              width: 34,
              height: 34,
              color: MUTED,
              cursor: !image || downloading ? "not-allowed" : "pointer",
            }}
          >
            {downloading ? (
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeDasharray="14 42"
                >
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 12 12"
                    to="360 12 12"
                    dur="0.8s"
                    repeatCount="indefinite"
                  />
                </circle>
              </svg>
            ) : (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3v12" />
                <path d="M7 11l5 5 5-5" />
                <path d="M4 20h16" />
              </svg>
            )}
          </button>
          <span style={{ ...smallCaps, fontSize: 9 }}>Base</span>
        </span>
      </div>

      {/* Art plate */}
      <div
        className="p-4"
        style={{ backgroundColor: IVORY, borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <HoloFrame
          className="w-full"
          overlay={
            busy ? (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.9)" }}
              >
                <span style={smallCaps}>Processing…</span>
              </div>
            ) : undefined
          }
        >
          <div className="relative aspect-square flex items-center justify-center">
            {image ? (
              <Image
                src={image}
                alt={`${itemName} #${tokenIdStr}`}
                width={280}
                height={280}
                className="w-full h-auto"
                style={{ imageRendering: "pixelated" }}
              />
            ) : (
              <span style={{ ...SERIF, fontStyle: "italic", color: MUTED }}>
                No. {tokenIdStr}
              </span>
            )}
          </div>
        </HoloFrame>
      </div>

      <div className="p-3.5 flex flex-col flex-1">
        {/* Title */}
        <p style={{ ...SERIF, fontWeight: 500, fontSize: 19 }}>
          {itemName} #{tokenIdStr}
        </p>

        {/* Approval status */}
        <p
          className="mt-1.5 flex items-center gap-1.5"
          style={{ ...smallCaps, fontSize: 9.5, color: approved ? GREEN : AMBER }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            {approved && <path d="M9 12l2 2 4-4" />}
          </svg>
          {approved ? "Approved for sale" : "Approval required"}
        </p>

        {/* Primary action — Sign / Claim */}
        <button
          onClick={onPrimaryClick}
          disabled={primaryDisabled}
          title={primaryLabel}
          className="mt-3 w-full transition-opacity enabled:hover:opacity-85"
          style={{
            ...smallCaps,
            fontSize: 10.5,
            letterSpacing: "0.16em",
            padding: "13px",
            minHeight: 44,
            color: primaryColor,
            backgroundColor: primaryBg,
            border: primaryBorder,
            cursor: primaryDisabled ? "not-allowed" : "pointer",
          }}
        >
          {primaryLabel}
        </button>

        {/* More toggle */}
        <button
          onClick={onToggleExpand}
          aria-expanded={isExpanded}
          className="mt-3 w-full text-center transition-colors hover:text-black"
          style={{
            ...smallCaps,
            fontSize: 9,
            color: MUTED,
            padding: "10px 0 0",
            minHeight: 32,
            borderTop: `1px solid ${HAIRLINE}`,
          }}
        >
          {isExpanded ? "Less ▲" : "More ▼"}
        </button>

        {/* Hidden row — Send / Sell at Bid */}
        {isExpanded && (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              onClick={onSend}
              disabled={busy}
              title={`Send ${itemName} #${tokenIdStr} to another address`}
              className="flex items-center justify-center gap-1.5 transition-opacity enabled:hover:opacity-85"
              style={{
                ...smallCaps,
                fontSize: 10,
                padding: "12px 8px",
                minHeight: 44,
                backgroundColor: busy ? IVORY : INK,
                color: busy ? MUTED : "#fff",
                border: busy ? `1px solid ${HAIRLINE}` : "none",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Send
            </button>
            <button
              onClick={onSellClick}
              disabled={busy || !hasBid}
              title={hasBid ? `Sell ${itemName} #${tokenIdStr} to highest bid` : "No active bid yet"}
              className="flex items-center justify-center gap-1.5 transition-opacity enabled:hover:opacity-85"
              style={{
                ...smallCaps,
                fontSize: 10,
                padding: "12px 8px",
                minHeight: 44,
                backgroundColor: !hasBid || busy ? IVORY : isArmed ? "#9A2D2D" : INK,
                color: !hasBid || busy ? MUTED : "#fff",
                border: !hasBid || busy ? `1px solid ${HAIRLINE}` : "none",
                cursor: !hasBid || busy ? "not-allowed" : "pointer",
              }}
            >
              {isArmed ? (
                `Confirm — Ξ${currentBidDisplay}`
              ) : (
                <>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="4" y1="20" x2="4" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="20" y1="20" x2="20" y2="14" />
                  </svg>
                  Sell at Bid
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
