// A small circle that lerps toward the pointer with GSAP quickTo, scales up over
// interactive elements, and inverts over the dark section — trailed by a subtle
// accent "flow": short-lived dots seeded along the pointer's path that fade and
// shrink. Dense when you move slowly, sparse on a fast flick, gone when idle.
//
// The caller only mounts this on desktop pointer:fine devices with motion
// allowed, so this component assumes those conditions hold. Elements are pooled
// and animated with transform/opacity only.

import { useEffect, useRef } from "react";
import gsap from "gsap";

const INTERACTIVE = "a, button, [data-cursor='hover']";

/** Flow tuning: pool size, spacing between seeded dots, and how far each fades. */
const TRAIL_COUNT = 24;
const TRAIL_SPACING = 13; // px of travel between seeded dots
const TRAIL_MAX_PER_MOVE = 6; // cap dots seeded in a single fast move
const TRAIL_LIFE = 0.55; // seconds

export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot = dotRef.current;
    const trail = trailRef.current;
    if (!dot || !trail) return;

    gsap.set(dot, { xPercent: -50, yPercent: -50, x: -100, y: -100 });
    const moveX = gsap.quickTo(dot, "x", { duration: 0.45, ease: "power3.out" });
    const moveY = gsap.quickTo(dot, "y", { duration: 0.45, ease: "power3.out" });

    // Pool of trail dots, reused round-robin so movement never allocates.
    const pool: HTMLDivElement[] = [];
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const el = document.createElement("div");
      el.className = "cursor-trail-dot";
      trail.appendChild(el);
      gsap.set(el, { xPercent: -50, yPercent: -50, opacity: 0, scale: 0 });
      pool.push(el);
    }
    let cursor = 0;

    function seed(x: number, y: number) {
      const el = pool[cursor];
      cursor = (cursor + 1) % TRAIL_COUNT;
      gsap.killTweensOf(el);
      gsap.set(el, { x, y, scale: 1, opacity: 0.4 });
      gsap.to(el, {
        opacity: 0,
        scale: 0.25,
        duration: TRAIL_LIFE,
        ease: "power2.out",
        overwrite: true,
      });
    }

    let visible = false;
    let last: { x: number; y: number } | null = null;

    function onMove(e: PointerEvent) {
      const { clientX: x, clientY: y } = e;
      moveX(x);
      moveY(y);

      if (!visible) {
        visible = true;
        gsap.to([dot, trail], { opacity: 1, duration: 0.3 });
      }

      // Seed the flow evenly along the segment travelled since the last seed,
      // so slow drags read as a continuous ribbon and fast flicks stay sparse.
      if (last) {
        const dx = x - last.x;
        const dy = y - last.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= TRAIL_SPACING) {
          const steps = Math.min(Math.floor(dist / TRAIL_SPACING), TRAIL_MAX_PER_MOVE);
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            seed(last.x + dx * t, last.y + dy * t);
          }
          last = { x, y };
        }
      } else {
        last = { x, y };
      }

      // Invert (brighter accent) when the pointer is over the dark section.
      const overDark = Boolean((e.target as Element | null)?.closest?.(".invert"));
      dot!.classList.toggle("is-inverted", overDark);
      trail!.classList.toggle("is-inverted", overDark);
    }

    function onOver(e: PointerEvent) {
      const hit = (e.target as Element | null)?.closest?.(INTERACTIVE);
      dot!.classList.toggle("is-hover", Boolean(hit));
    }

    function onLeave() {
      visible = false;
      last = null;
      gsap.to([dot, trail], { opacity: 0, duration: 0.3 });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerover", onOver);
    document.addEventListener("pointerleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf(pool);
      for (const el of pool) el.remove();
    };
  }, []);

  return (
    <>
      <div ref={trailRef} className="cursor-trail" aria-hidden={true} />
      <div ref={dotRef} className="cursor-dot" aria-hidden={true} />
    </>
  );
}
