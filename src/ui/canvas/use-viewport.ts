"use client";

// Pan and zoom for the canvas (tasks 5.5 to 5.7).
//
// The view lives in a ref, not in React state: dragging and zooming write one CSS
// transform per animation frame and never re-render the nodes.
import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { centerOn, fitView, panBy, readableZoomFor, zoomAt, IDENTITY, READABLE_ZOOM, type Rect, type Size, type View } from "@/layout";

export interface ViewportApi {
  zoomBy(factor: number): void;
  /** Back to 100%, top-left of the picture in view. */
  reset(): void;
  /** Shows the whole picture, however small that makes it. */
  fit(): void;
  /** Shows as much as fits at a zoom where the text can still be read. */
  frame(): void;
  focus(box: Rect): void;
  view(): View;
  size(): Size;
  /** True until the student pans or zooms by hand; Fit turns it back on. */
  following(): boolean;
}

interface Options {
  containerRef: RefObject<HTMLDivElement | null>;
  /** The layer that holds everything drawn in world coordinates. */
  contentRef: RefObject<HTMLElement | null>;
  /** Element whose text shows the zoom percentage. */
  percentRef: RefObject<HTMLElement | null>;
  /** Latest picture bounds, read when fitting. */
  boundsRef: RefObject<Rect>;
  /** Called at most once per frame after the view changed. */
  onViewChange?: (view: View, size: Size) => void;
}

/** Below this zoom the text inside nodes is hidden. */
const LOW_DETAIL_ZOOM = READABLE_ZOOM;
const DRAG_THRESHOLD = 4;

export function useViewport({ containerRef, contentRef, percentRef, boundsRef, onViewChange }: Options): ViewportApi {
  const viewRef = useRef<View>(IDENTITY);
  const frameRef = useRef<number | null>(null);
  const followRef = useRef(true);
  const onChangeRef = useRef(onViewChange);
  useEffect(() => { onChangeRef.current = onViewChange; }, [onViewChange]);

  const size = useCallback((): Size => {
    const el = containerRef.current;
    return { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 };
  }, [containerRef]);

  const schedule = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const v = viewRef.current;
      const content = contentRef.current;
      if (content) content.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
      // Written only when they change: each write would cost a style or layout pass.
      const container = containerRef.current;
      const lod = v.k < LOW_DETAIL_ZOOM ? "low" : "full";
      if (container && container.dataset.lod !== lod) container.dataset.lod = lod;
      const percent = `${Math.round(v.k * 100)}%`;
      if (percentRef.current && percentRef.current.textContent !== percent) percentRef.current.textContent = percent;
      onChangeRef.current?.(v, size());
    });
  }, [containerRef, contentRef, percentRef, size]);

  const set = useCallback((next: View) => { viewRef.current = next; schedule(); }, [schedule]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Mouse position inside the canvas. This reads the canvas's own position on the page;
    // it is not used to place nodes or arrows (those come from src/layout).
    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const speed = e.ctrlKey ? 0.01 : 0.0018; // ctrl + wheel is how browsers report a pinch
      followRef.current = false;
      set(zoomAt(viewRef.current, local(e), Math.exp(-e.deltaY * speed)));
    };

    let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as Element).closest("[data-no-pan]")) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!drag.moved) { drag.moved = true; followRef.current = false; el.setPointerCapture(e.pointerId); el.dataset.dragging = "true"; }
      drag.x = e.clientX; drag.y = e.clientY;
      set(panBy(viewRef.current, dx, dy));
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) {
        // Swallow the click that ends a drag so it does not select a node.
        const stop = (c: Event) => { c.stopPropagation(); el.removeEventListener("click", stop, true); };
        el.addEventListener("click", stop, true);
        setTimeout(() => el.removeEventListener("click", stop, true), 0);
      }
      delete el.dataset.dragging;
      drag = null;
    };

    // When the canvas changes size (inspector opened, window resized, fullscreen), keep
    // the whole picture in view unless the student has taken over the camera.
    const resize = new ResizeObserver(() => {
      if (followRef.current) set(fitView(boundsRef.current, size(), readableZoomFor(size().width)));
      else schedule();
    });
    resize.observe(el);

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      resize.disconnect();
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [boundsRef, containerRef, schedule, set, size]);

  return useMemo<ViewportApi>(() => ({
    zoomBy: (factor) => { const s = size(); if (factor !== 1) followRef.current = false; set(zoomAt(viewRef.current, { x: s.width / 2, y: s.height / 2 }, factor)); },
    reset: () => { const b = boundsRef.current; followRef.current = false; set({ k: 1, x: 32 - b.x, y: 32 - b.y }); },
    fit: () => { followRef.current = true; set(fitView(boundsRef.current, size())); },
    frame: () => set(fitView(boundsRef.current, size(), readableZoomFor(size().width))),
    focus: (box) => { followRef.current = false; set(centerOn(box, size(), Math.max(viewRef.current.k, 1))); },
    following: () => followRef.current,
    view: () => viewRef.current,
    size,
  }), [boundsRef, set, size]);
}
