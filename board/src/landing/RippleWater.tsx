// Hero background: a full-bleed water surface behind the hero content. Pointer
// movement leaves a soft wake, clicks drop a larger impulse, the page announces
// itself with one ripple from the centre on load, and an occasional faint drop
// keeps the pool alive while the pointer is idle.
//
// The caller mounts this only on desktop with motion allowed. WebGL init is
// guarded: if a context can't be created the canvas simply stays transparent and
// the paper hero shows through - the page never breaks.

import { useEffect, useRef } from "react";
import { WaterRipple } from "./ripple/WaterRipple.js";

const WAKE_SPACING = 0.012; // uv distance between wake drops - dense = flowing
const IDLE_MS = 2600;
const IDLE_EVERY_MS = 4000;

function cssVar(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

export function RippleWater() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const water = new WaterRipple(canvas);
    if (!water.init(cssVar("--accent", "#e5491f"))) {
      canvas.style.display = "none";
      return;
    }

    let inView = true;
    let visible = document.visibilityState === "visible";
    const sync = () => {
      if (inView && visible) water.start();
      else water.stop();
    };

    const ro = new ResizeObserver(() => water.resize());
    ro.observe(canvas);

    const io = new IntersectionObserver(
      ([e]) => {
        inView = e.isIntersecting;
        sync();
      },
      { threshold: 0.01 },
    );
    io.observe(canvas);

    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Announce the effect: one ripple from the centre.
    water.addDrop(0.5, 0.5, 0.09, 0.34);

    let lastU = 0.5;
    let lastV = 0.5;
    let lastPointer = performance.now();

    function toUv(clientX: number, clientY: number): [number, number] | null {
      const r = canvas!.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
        return null;
      }
      return [(clientX - r.left) / r.width, 1 - (clientY - r.top) / r.height];
    }

    function onMove(e: PointerEvent) {
      const uv = toUv(e.clientX, e.clientY);
      if (!uv) return;
      lastPointer = performance.now();
      const [u, v] = uv;
      if (Math.hypot(u - lastU, v - lastV) < WAKE_SPACING) return;
      lastU = u;
      lastV = v;
      // A soft, continuous wake so the dark matter flows off the cursor.
      water.addDrop(u, v, 0.04, 0.09);
    }

    function onClick(e: PointerEvent) {
      const uv = toUv(e.clientX, e.clientY);
      if (!uv) return;
      lastPointer = performance.now();
      water.addDrop(uv[0], uv[1], 0.07, 0.32);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onClick, { passive: true });

    // Occasional faint drop while idle, so the hero is never fully static.
    const idle = window.setInterval(() => {
      if (!inView || !visible) return;
      if (performance.now() - lastPointer < IDLE_MS) return;
      water.addDrop(0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6, 0.05, 0.05);
    }, IDLE_EVERY_MS);

    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onClick);
      window.clearInterval(idle);
      water.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden={true} />;
}
