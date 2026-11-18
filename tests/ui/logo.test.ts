// The browser-tab icon is a static file, so it repeats the logo's geometry. This keeps
// the two from drifting apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOGO_GLINT, LOGO_NODES, LOGO_SHAPE, LOGO_VIEW_BOX } from "../../src/ui/site/logo-shape";

const icon = readFileSync(join(__dirname, "..", "..", "src", "app", "icon.svg"), "utf8");

test("the tab icon draws exactly the logo's shape", () => {
  assert.ok(icon.includes(`viewBox="${LOGO_VIEW_BOX}"`), "view box");
  for (const [part, d] of Object.entries(LOGO_SHAPE)) assert.ok(icon.includes(`d="${d}"`), part);
  for (const { cx, cy, r } of [...LOGO_NODES, LOGO_GLINT]) assert.ok(icon.includes(`cx="${cx}" cy="${cy}" r="${r}"`), `circle at ${cx},${cy}`);
});
