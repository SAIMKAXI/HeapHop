// What "fits the screen" means for one page at one size (8.21), as a function the browser runs:
// - nothing makes the page scroll sideways;
// - nothing visible sticks out past the left or right edge (unless a scrolling or clipping box
//   it sits in keeps it inside);
// - below 1024 px (fingers), every visible button, standalone link, field and tab is at least
//   40 x 40 px. Links inside a sentence are exempt (they are part of the text), and so are rows
//   of text that can be tapped (lines of code, the pointer chips in the stack) and the
//   timeline's tick marks (the timeline itself is the control).

/** Returns a list of problems (empty when the page fits). */
export async function layoutProblems(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const touch = window.innerWidth < 1024;
    const problems = [];
    const name = (e) => {
      const data = [...e.attributes].filter((a) => a.name.startsWith("data-") || a.name === "aria-label").map((a) => `[${a.name}${a.value ? `="${a.value.slice(0, 24)}"` : ""}]`).slice(0, 2).join("");
      const text = (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
      return `${e.tagName.toLowerCase()}${data}${text ? ` "${text}"` : ""}`;
    };
    const shown = (e) => {
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false;
      const b = e.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) return false; // sr-only and empty boxes
      return !e.closest("[hidden], [aria-hidden=true], [inert]");
    };
    const clippedInside = (e) => {
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (/(hidden|auto|scroll|clip)/.test(cs.overflowX) || cs.position === "fixed") {
          const b = a.getBoundingClientRect();
          if (b.left >= -1 && b.right <= W + 1) return true;
        }
      }
      return false;
    };

    if (document.documentElement.scrollWidth > W + 1) problems.push(`the page scrolls sideways (${document.documentElement.scrollWidth} px wide in ${W} px)`);

    for (const e of document.querySelectorAll("body *")) {
      if (e.closest("svg") && e.tagName.toLowerCase() !== "svg") continue;
      const b = e.getBoundingClientRect();
      if (!b.width || !b.height || (b.right <= W + 1 && b.left >= -1)) continue;
      if (!shown(e) || clippedInside(e)) continue;
      problems.push(`${name(e)} sticks out (${Math.round(b.left)} to ${Math.round(b.right)} px of ${W})`);
      if (problems.length > 8) break;
    }

    if (touch) {
      const controls = document.querySelectorAll("a[href], button, input:not([type=hidden]):not([type=range]), select, textarea, [role=tab], summary");
      for (const e of controls) {
        if (!shown(e) || e.matches("[data-timeline-mark], [data-source-line], [data-pointer-cell]")) continue;
        if (e.tagName === "A" && getComputedStyle(e).display === "inline") continue; // a link in a sentence
        const b = e.getBoundingClientRect();
        if (b.width < 39.5 || b.height < 39.5) problems.push(`${name(e)} is ${Math.round(b.width)} x ${Math.round(b.height)} px, too small to tap`);
      }
    }
    return problems;
  });
}

/** The sizes every page is checked at: phones upright and sideways, tablets, laptops, big screens. */
export const SIZES = [
  [320, 568], [360, 740], [390, 844], [430, 932],
  [667, 375], [844, 390],
  [768, 1024], [820, 1180], [1024, 768], [1180, 820],
  [1280, 800], [1440, 900], [1920, 1080], [2560, 1440], [3840, 2160],
];

/** Sets the window size the way a device of that shape would report it. */
export function viewportFor(width, height) {
  const small = width < 1024;
  return { width, height, deviceScaleFactor: 1, isMobile: small && height > width, hasTouch: small };
}
