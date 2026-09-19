// The full-screen ripple sheet played once on "/" → "/board" navigation. Split
// into its own module (imported lazily by RouteRipple) so three.js stays out of
// the initial bundle and is only fetched when the flourish actually runs.

import { useEffect, useRef } from "react";
import { WaterRipple } from "./ripple/WaterRipple.js";

const FADE_MS = 380;

function cssVar(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

export function RippleFlourish({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const water = new WaterRipple(canvas);
    if (!water.init(cssVar("--accent", "#e5491f"))) {
      onDone();
      return;
    }
    water.addDrop(0.5, 0.5, 0.12, 0.42);
    water.start();

    // Fade the sheet away to reveal the board settling in.
    const fade = requestAnimationFrame(() => {
      canvas.style.opacity = "0";
    });
    const done = window.setTimeout(() => {
      water.dispose();
      onDone();
    }, FADE_MS + 20);

    return () => {
      cancelAnimationFrame(fade);
      window.clearTimeout(done);
      water.dispose();
    };
  }, [onDone]);

  return (
    <canvas
      ref={canvasRef}
      className="ripple-transition"
      aria-hidden={true}
      style={{ transition: `opacity ${FADE_MS}ms ease-out` }}
    />
  );
}
