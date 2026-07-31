"use client";

import { useCallback, useRef } from "react";

// Pointer-driven holographic frame, modeled on the poke-holo.simey.me
// technique: mouse position is written directly to CSS custom properties on
// the DOM node (no React re-render per move) and the foil/sparkle/glare
// layers read those vars for their gradient position + opacity. Wraps any
// artwork — used on collection hero cards.
export function HoloFrame({
  children,
  overlay,
  className,
}: {
  children: React.ReactNode;
  overlay?: React.ReactNode;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

  const updateFromPointer = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * 100;
    const py = ((clientY - rect.top) / rect.height) * 100;
    const clampedX = Math.min(100, Math.max(0, px));
    const clampedY = Math.min(100, Math.max(0, py));

    // Distance of the pointer from the frame center, 0 (center) -> 1 (corner).
    const centerDist = Math.min(
      1,
      Math.hypot(clampedX - 50, clampedY - 50) / 70,
    );

    const rotateY = ((clampedX / 100) * 14 - 7).toFixed(2);
    const rotateX = (6 - (clampedY / 100) * 12).toFixed(2);

    el.style.setProperty("--px", `${clampedX}%`);
    el.style.setProperty("--py", `${clampedY}%`);
    el.style.setProperty("--rx", `${rotateY}deg`);
    el.style.setProperty("--ry", `${rotateX}deg`);
    el.style.setProperty("--pointer-from-center", centerDist.toFixed(3));
  }, []);

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const { clientX, clientY } = event;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() =>
      updateFromPointer(clientX, clientY),
    );
  };

  const handleLeave = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    const el = wrapRef.current;
    if (!el) return;
    el.style.setProperty("--px", "50%");
    el.style.setProperty("--py", "50%");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--pointer-from-center", "0");
    el.classList.remove("is-active");
  };

  const handleEnter = () => {
    wrapRef.current?.classList.add("is-active");
  };

  return (
    <div
      ref={wrapRef}
      onMouseMove={handleMove}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className={`holo-frame${className ? ` ${className}` : ""}`}
      style={{ position: "relative", perspective: 1400 }}
    >
      <style jsx>{`
        .holo-frame {
          --px: 50%;
          --py: 50%;
          --rx: 0deg;
          --ry: 0deg;
          --pointer-from-center: 0;
        }
        .holo-frame__inner {
          transform: rotateX(var(--ry)) rotateY(var(--rx));
          transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .holo-frame.is-active .holo-frame__inner {
          transition: transform 0.08s ease-out;
        }
        .holo-frame__foil,
        .holo-frame__sparkle,
        .holo-frame__glare {
          transition: opacity 0.6s ease;
        }
        .holo-frame.is-active .holo-frame__foil,
        .holo-frame.is-active .holo-frame__sparkle,
        .holo-frame.is-active .holo-frame__glare {
          transition: opacity 0.15s ease;
        }
      `}</style>
      <div
        className="holo-frame__inner"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {children}

        {/* rainbow foil — parallax rainbow bands that track the pointer */}
        <div
          className="holo-frame__foil"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `repeating-linear-gradient(115deg, #ff2d78 0%, #ffce00 12%, #23e0a0 24%, #00b4ff 36%, #a742ff 48%, #ff2d78 60%)`,
            backgroundSize: "220% 220%",
            backgroundPosition: "var(--px) var(--py)",
            mixBlendMode: "hard-light",
            opacity: "calc(0.12 + var(--pointer-from-center) * 0.5)",
            pointerEvents: "none",
          }}
        />

        {/* glitter — fine sparkle grid, also parallaxed by pointer */}
        <div
          className="holo-frame__sparkle"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.95) 1px, transparent 1.6px)",
            backgroundSize: "8px 8px",
            backgroundPosition: "var(--px) var(--py)",
            mixBlendMode: "color-dodge",
            opacity: "calc(var(--pointer-from-center) * 0.4)",
            pointerEvents: "none",
          }}
        />

        {/* glare — soft spotlight that follows the cursor */}
        <div
          className="holo-frame__glare"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at var(--px) var(--py), rgba(255,255,255,0.8), rgba(255,255,255,0) 55%)",
            mixBlendMode: "overlay",
            opacity: "calc(0.06 + var(--pointer-from-center) * 0.5)",
            pointerEvents: "none",
          }}
        />

        {/* card overlay — badges/nameplate, painted on top so the holo layers never wash them out */}
        {overlay && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {overlay}
          </div>
        )}
      </div>
    </div>
  );
}
