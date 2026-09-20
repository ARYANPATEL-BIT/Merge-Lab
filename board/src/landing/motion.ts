// Motion helpers for the landing page. GSAP + ScrollTrigger drive short, subtle
// section reveals; everything degrades to instant when the user asks for reduced
// motion. WebGL and the custom cursor are additionally gated to desktop.

import { useEffect, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Desktop, fine pointer, motion allowed - the bar for WebGL + custom cursor. */
export function richMotionAllowed(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 768px)").matches &&
    window.matchMedia("(pointer: fine)").matches &&
    !prefersReducedMotion()
  );
}

/**
 * Reveal each `[data-reveal]` group inside `scope`: its direct children rise
 * 24px and fade in, staggered, when the group enters the viewport. Reduced
 * motion leaves everything in place. Scoped to `scope` via gsap.context so
 * ScrollTrigger never rescans the whole page and everything cleans up on unmount.
 */
export function useReveals(scope: RefObject<HTMLElement>) {
  useEffect(() => {
    const root = scope.current;
    if (!root || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      const groups = gsap.utils.toArray<HTMLElement>("[data-reveal]");
      for (const group of groups) {
        const targets = group.children.length ? group.children : [group];
        gsap.from(targets, {
          opacity: 0,
          y: 24,
          duration: 0.55,
          stagger: 0.08,
          ease: "power2.out",
          scrollTrigger: { trigger: group, start: "top 85%" },
        });
      }
    }, root);

    // Fonts and the hero canvas settle after first paint; recompute triggers.
    const refresh = () => ScrollTrigger.refresh();
    const raf = requestAnimationFrame(refresh);

    return () => {
      cancelAnimationFrame(raf);
      ctx.revert();
    };
  }, [scope]);
}

/** Keep the document title in sync per route. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
