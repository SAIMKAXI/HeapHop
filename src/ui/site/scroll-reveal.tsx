"use client";

// Fades and lifts page content into place as it scrolls into view.
//
// Markup opts in two ways:
//   data-reveal           this element is revealed on its own
//   data-reveal-children  each child is revealed on its own (a child that is itself a
//                         data-reveal-children group is not, its children are instead)
// Items that come into view together are staggered a little, so a row of cards arrives
// one card after another.
//
// The hiding is done by CSS, and only while <html data-reveal> is set. The inline script
// in the root layout sets it before the first paint (so nothing flashes), but only when the
// visitor has not asked for reduced motion; it clears it again if this component never
// starts. This component marks it "live" when it runs. Without JavaScript nothing is hidden.
import { useEffect } from "react";

export const REVEAL_ITEMS = "[data-reveal], [data-reveal-children] > :not([data-reveal-children])";
const STAGGER_MS = 70;
const MAX_STAGGER = 6;

export function ScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute("data-reveal")) return;
    root.setAttribute("data-reveal", "live");
    const seen = new WeakSet<Element>();

    const io = new IntersectionObserver((entries) => {
      let n = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.style.setProperty("--reveal-delay", `${Math.min(n++, MAX_STAGGER) * STAGGER_MS}ms`);
        el.setAttribute("data-shown", "");
        io.unobserve(el);
      }
    }, { rootMargin: "0px 0px -8% 0px" });

    const scan = () => {
      for (const el of document.querySelectorAll(REVEAL_ITEMS)) {
        if (seen.has(el) || el.hasAttribute("data-shown")) continue;
        seen.add(el);
        io.observe(el);
      }
    };
    scan();
    // Learn swaps its list for a lesson and back without a page load: pick up new items.
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);
  return null;
}
