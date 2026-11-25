// Viewport math (tasks 5.5 and 5.6): pan, zoom around a point, fit, focus.
// screen = world * k + (x, y)
import type { Point, Rect } from "./types";

export interface View { x: number; y: number; k: number }
export interface Size { width: number; height: number }

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 3;
export const IDENTITY: View = { x: 0, y: 0, k: 1 };

const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

export function screenToWorld(view: View, p: Point): Point {
  return { x: (p.x - view.x) / view.k, y: (p.y - view.y) / view.k };
}

/** Zoom by `factor`, keeping the world point under `anchor` (a screen point) where it is. */
export function zoomAt(view: View, anchor: Point, factor: number): View {
  const k = clampZoom(view.k * factor);
  const ratio = k / view.k;
  return { k, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio };
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

/** Show all of `bounds`, centred, never zoomed in past `maxZoom`. */
/** Below this zoom the text inside nodes is too small to read and is hidden. */
export const READABLE_ZOOM = 0.45;

/** On a phone-width canvas the text is already small, so the camera stops zooming out here. */
export const PHONE_READABLE_ZOOM = 0.7;
const PHONE_CANVAS = 560;

/** How far the camera may zoom out to fit a run, for a canvas this many pixels wide. */
export function readableZoomFor(canvasWidth: number): number {
  return canvasWidth < PHONE_CANVAS ? PHONE_READABLE_ZOOM : READABLE_ZOOM;
}

/**
 * Show all of `bounds`, centred, never zoomed in past 100%. With `minZoom`, never zoom out
 * further than that: a picture that is still too wide then shows its left end, where a
 * list's head is.
 */
export function fitView(bounds: Rect, size: Size, minZoom = MIN_ZOOM, padding = 48): View {
  if (bounds.width <= 0 || bounds.height <= 0 || size.width <= 0 || size.height <= 0) return IDENTITY;
  const whole = Math.min((size.width - 2 * padding) / bounds.width, (size.height - 2 * padding) / bounds.height, 1);
  const k = clampZoom(Math.max(whole, minZoom));
  const fitsAcross = bounds.width * k <= size.width;
  return {
    k,
    x: fitsAcross ? (size.width - bounds.width * k) / 2 - bounds.x * k : padding - bounds.x * k,
    y: (size.height - bounds.height * k) / 2 - bounds.y * k,
  };
}

/** Put the centre of `box` in the middle of the screen at zoom `k`. */
export function centerOn(box: Rect, size: Size, k: number): View {
  const zoom = clampZoom(k);
  return {
    k: zoom,
    x: size.width / 2 - (box.x + box.width / 2) * zoom,
    y: size.height / 2 - (box.y + box.height / 2) * zoom,
  };
}

/** The part of the world that is on screen, grown by `margin` world pixels on every side. */
export function visibleWorldRect(view: View, size: Size, margin = 0): Rect {
  const topLeft = screenToWorld(view, { x: 0, y: 0 });
  return {
    x: topLeft.x - margin,
    y: topLeft.y - margin,
    width: size.width / view.k + 2 * margin,
    height: size.height / view.k + 2 * margin,
  };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
