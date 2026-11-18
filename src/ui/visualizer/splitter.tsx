"use client";

// A draggable divider between two side-by-side panels. Drag it, or focus it and use the
// arrow keys (Shift for bigger steps); double-click puts the panel back to its default width.
import { useRef } from "react";
import { cn } from "@/ui/utils";

interface SplitterProps {
  /** What it resizes, for screen readers: "Resize the code panel". */
  label: string;
  /** Width of the panel on its left. */
  value: number;
  min: number;
  /** The widest the panel may get right now: measured when it is used, as the window can change. */
  max: () => number;
  defaultValue: number;
  onChange: (width: number) => void;
  className?: string;
}

const KEY_STEP = 16;

export function Splitter({ label, value, min, max, defaultValue, onChange, className }: SplitterProps) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const set = (width: number) => onChange(Math.round(Math.min(Math.max(width, min), Math.max(min, max()))));
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuetext={`${value} pixels wide`}
      tabIndex={0}
      data-splitter
      className={cn(
        "relative w-1.5 shrink-0 cursor-col-resize touch-none bg-card-border/70 transition-colors hover:bg-accent/70 focus-visible:bg-accent focus-visible:outline-none",
        className
      )}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, width: value };
      }}
      onPointerMove={(e) => {
        if (drag.current) set(drag.current.width + e.clientX - drag.current.x);
      }}
      onPointerUp={(e) => {
        // The last fast move can arrive merged into the release: finish at the release point.
        if (drag.current) set(drag.current.width + e.clientX - drag.current.x);
        drag.current = null;
      }}
      onPointerCancel={() => { drag.current = null; }}
      onDoubleClick={() => set(defaultValue)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? KEY_STEP * 4 : KEY_STEP;
        const width = { ArrowLeft: value - step, ArrowRight: value + step, Home: min, End: max() }[e.key];
        if (width === undefined) return;
        e.preventDefault();
        set(width);
      }}
    />
  );
}
