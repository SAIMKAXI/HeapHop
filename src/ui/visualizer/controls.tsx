"use client";

// Timeline and transport buttons. The timeline is a native range input, so it works with
// a mouse, a finger and the keyboard, and needs no measuring.
import type { ReactNode } from "react";
import { ArrowDownToLine, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Keyboard, Minus, Pause, Play, Plus } from "lucide-react";
import { cn } from "@/ui/utils";
import { SPEEDS, type Playback } from "./use-playback";

interface ControlsProps {
  playback: Playback;
  /** Steps related to the current selection, shown as ticks on the timeline. */
  marks: number[];
}

function IconButton({ title, onClick, disabled, children, className }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn("rounded-lg p-2 text-muted-foreground transition-colors hover:bg-card-border/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-25", className)}
    >
      {children}
    </button>
  );
}

export function Controls({ playback: p, marks }: ControlsProps) {
  const total = p.last + 1;
  const speedIndex = SPEEDS.indexOf(p.speed as (typeof SPEEDS)[number]);
  const atStart = p.step === 0;
  const atEnd = p.step === p.last;

  return (
    <div className="border-t-2 border-card-border bg-card px-3 py-3 sm:px-5">
      <div className="relative mb-2">
        <input
          type="range"
          data-timeline
          aria-label="Timeline"
          aria-valuetext={`Step ${p.step + 1} of ${total}`}
          min={0}
          max={p.last}
          value={p.step}
          onChange={(e) => p.goTo(Number(e.target.value))}
          className="hh-timeline w-full"
          style={{ "--hh-progress": `${p.last > 0 ? (p.step / p.last) * 100 : 100}%` } as React.CSSProperties}
        />
        {p.last > 0 && marks.map((m) => (
          <button
            key={m}
            type="button"
            data-timeline-mark={m}
            aria-label={`Jump to step ${m + 1}`}
            title={`Step ${m + 1}`}
            onClick={() => p.goTo(m)}
            className={cn("absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-background hover:scale-125", m === p.step ? "bg-foreground" : "bg-warning")}
            style={{ left: `${(m / p.last) * 100}%` }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <IconButton title="Go to first step" onClick={p.first} disabled={atStart}><ChevronsLeft size={18} /></IconButton>
          <IconButton title="Previous step (←)" onClick={p.prev} disabled={atStart}><ChevronLeft size={20} /></IconButton>
          <IconButton
            title={p.playing ? "Pause" : "Auto-play"}
            onClick={p.togglePlay}
            disabled={atEnd && !p.playing}
            className={cn("rounded-xl p-3", p.playing ? "bg-warning/15 text-warning hover:bg-warning/25" : "bg-accent/15 text-accent hover:bg-accent/25")}
          >
            {p.playing ? <Pause size={18} /> : <Play size={18} />}
          </IconButton>
          <IconButton title="Next step (→ or Space)" onClick={p.next} disabled={atEnd}><ChevronRight size={20} /></IconButton>
          <IconButton title="Step over function call (S)" onClick={p.stepOver} disabled={atEnd}><ArrowDownToLine size={17} /></IconButton>
          <IconButton title="Go to last step" onClick={p.end} disabled={atEnd}><ChevronsRight size={18} /></IconButton>
        </div>

        <span className="text-sm tabular-nums text-muted-foreground">
          <span className="font-bold text-foreground">{p.step + 1}</span> / {total}
        </span>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <IconButton title="Slower" onClick={() => p.setSpeed(SPEEDS[speedIndex - 1])} disabled={speedIndex <= 0} className="p-1"><Minus size={13} /></IconButton>
            <span className="min-w-[40px] text-center text-xs tabular-nums text-muted-foreground" aria-label="Speed">{p.speed}x</span>
            <IconButton title="Faster" onClick={() => p.setSpeed(SPEEDS[speedIndex + 1])} disabled={speedIndex >= SPEEDS.length - 1} className="p-1"><Plus size={13} /></IconButton>
          </div>
          <div className="hidden items-center gap-1.5 text-[11px] text-muted sm:flex">
            <Keyboard size={13} aria-hidden />
            <span>← → Space S R</span>
          </div>
        </div>
      </div>
    </div>
  );
}
