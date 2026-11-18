// Every text colour reaches WCAG AA contrast (4.5:1) on every surface it is
// drawn on, in both themes. Reads the colour tokens straight from globals.css.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(__dirname, "..", "..", "src", "app", "globals.css"), "utf8");

function tokens(selector: string): Record<string, string> {
  const block = css.slice(css.indexOf(`${selector} {`)).split("}")[0];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = ["foreground", "muted-foreground", "muted", "accent", "success", "danger", "warning",
  "syn-keyword", "syn-type", "syn-string", "syn-number", "syn-comment", "syn-function", "syn-preprocessor"];
const SURFACES = ["background", "header", "card", "code-bg"];

for (const [theme, selector] of [["dark", ":root"], ["light", ".light"]] as const) {
  test(`${theme} theme: every text colour has at least 4.5:1 contrast on every surface`, () => {
    const t = tokens(selector);
    const failing = TEXT.flatMap((text) => SURFACES.map((surface) => ({ text, surface, ratio: contrast(t[text], t[surface]) })))
      .filter((c) => c.ratio < 4.5)
      .map((c) => `${c.text} on ${c.surface}: ${c.ratio.toFixed(2)}`);
    assert.deepEqual(failing, []);
  });
}

for (const [theme, selector] of [["dark", ":root"], ["light", ".light"]] as const) {
  test(`${theme} theme: text on primary buttons is readable, and both arrow colours stand out from every surface`, () => {
    const t = tokens(selector);
    assert.ok(contrast(t["on-accent"], t.accent) >= 4.5, `on-accent on accent: ${contrast(t["on-accent"], t.accent).toFixed(2)}`);
    // Arrows are graphics: WCAG asks 3:1 against what they are drawn on.
    for (const arrow of ["accent", "prev"]) {
      for (const surface of ["background", "card"]) {
        assert.ok(contrast(t[arrow], t[surface]) >= 3, `${arrow} arrow on ${surface}: ${contrast(t[arrow], t[surface]).toFixed(2)}`);
      }
    }
  });
}
