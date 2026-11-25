"use client";

// The call stack, newest frame on top. Each variable is a MemoryBlock.
import { memo } from "react";
import type { StackFrame } from "@/core/types";
import { cn } from "@/ui/utils";
import { MemoryBlock } from "./memory-block";

function StackPanelImpl({ frames }: { frames: StackFrame[] }) {
  return (
    <section aria-label="Stack" className="flex flex-col gap-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Stack</h3>
      {frames.length === 0 && <p className="text-sm italic text-muted">empty</p>}
      {frames.toReversed().map((frame, i) => {
        const top = i === 0;
        const depth = frames.length - 1 - i;
        return (
          <div
            key={frame.callId}
            data-stack-frame={frame.name}
            data-active-frame={top || undefined}
            className={cn("rounded-xl border-2 transition-colors duration-300", top ? "border-accent/40 bg-card shadow-lg shadow-accent/5" : "border-card-border/50 bg-card/60")}
          >
            <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2.5", top ? "border-accent/20 text-accent" : "border-card-border/30 text-muted-foreground")}>
              <span className="min-w-0 text-sm font-bold [overflow-wrap:anywhere]">{frame.name}()</span>
              {depth > 0 && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[0.625rem] font-semibold text-warning">depth {depth}</span>}
              {top && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[0.625rem] font-semibold text-accent">active</span>}
            </div>
            <div className="flex flex-col gap-1 p-2.5">
              {frame.variables.length === 0
                ? <p className="px-3 py-1 text-sm italic text-muted">no variables</p>
                : frame.variables.map((v) => <MemoryBlock key={v.id} item={v} depth={1} />)}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** Steps share unchanged frames (structural sharing), so most steps re-render nothing here. */
export const StackPanel = memo(StackPanelImpl);
