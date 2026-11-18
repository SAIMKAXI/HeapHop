"use client";

// Canvas controls: zoom out, percentage, zoom in, 100%, fit, focus, robot, fullscreen.
import type { RefObject } from "react";
import { Bot, Focus, Maximize2, Minimize2, Minus, Plus, Scan } from "lucide-react";
import type { ViewportApi } from "./use-viewport";

interface CanvasToolbarProps {
  viewport: ViewportApi;
  percentRef: RefObject<HTMLSpanElement | null>;
  canFocus: boolean;
  onFocus: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  robot: boolean;
  onToggleRobot: () => void;
}

const button =
  "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

export function CanvasToolbar({ viewport, percentRef, canFocus, onFocus, fullscreen, onToggleFullscreen, robot, onToggleRobot }: CanvasToolbarProps) {
  return (
    <div
      data-no-pan
      role="toolbar"
      aria-label="Canvas view"
      className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-lg border border-card-border bg-card/95 p-1 shadow-lg"
    >
      <button type="button" className={button} onClick={() => viewport.zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out"><Minus size={15} /></button>
      <span ref={percentRef} data-zoom-percent className="w-11 text-center text-xs font-semibold tabular-nums text-muted-foreground" aria-live="off">100%</span>
      <button type="button" className={button} onClick={() => viewport.zoomBy(1.25)} aria-label="Zoom in" title="Zoom in"><Plus size={15} /></button>
      <span className="mx-1 h-5 w-px bg-card-border" />
      <button type="button" className={button} onClick={viewport.reset} aria-label="Reset zoom to 100%" title="Reset to 100%">1:1</button>
      <button type="button" className={button} onClick={viewport.fit} aria-label="Fit everything on screen" title="Fit to screen"><Scan size={15} /></button>
      <button type="button" className={button} onClick={onFocus} disabled={!canFocus} aria-label="Centre the selected node" title="Focus selected node"><Focus size={15} /></button>
      <span className="mx-1 h-5 w-px bg-card-border" />
      <button type="button" data-robot-toggle className={`${button} ${robot ? "text-accent" : ""}`} onClick={onToggleRobot} aria-pressed={robot} aria-label="Robot helper" title={robot ? "Hide the robot" : "Show the robot"}><Bot size={15} /></button>
      <button type="button" className={button} onClick={onToggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"} title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}>
        {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
    </div>
  );
}
