"use client";

import type { MemoryItem } from "@/core/types";
import { targetLabel } from "@/core/explain";
import { useInspect } from "@/ui/inspect-context";
import { RichText } from "@/ui/rich-text";
import { cn } from "@/ui/utils";

interface MemoryBlockProps {
  item: MemoryItem;
  depth?: number;
}

/** A long array shows the elements that hold a value (at most 12), not hundreds of empty rows. */
const MAX_ARRAY_ROWS = 12;
function visibleChildren(item: MemoryItem): MemoryItem[] {
  const all = item.children ?? [];
  if (item.kind !== "array" || all.length <= MAX_ARRAY_ROWS) return all;
  const set = all.filter((c) => c.children || c.value !== "?");
  return (set.length > 0 ? set : all).slice(0, MAX_ARRAY_ROWS);
}

export function MemoryBlock({ item, depth = 0 }: MemoryBlockProps) {
  const isStruct = !!item.children;
  const isOrphaned = item.orphaned;
  const inspect = useInspect();
  const selected = inspect?.selection?.kind === "pointer" && inspect.selection.cellId === item.id;
  const isPointer = item.pointsTo !== undefined;
  const isChanged = item.changed;

  if (isStruct) {
    return (
      <div
        data-cell-id={item.id}
        data-changed={isChanged || undefined}
        className={cn(
          "rounded-xl border-2 transition-all duration-300",
          isOrphaned
            ? "border-dashed border-danger/40 bg-danger-dim/30"
            : depth === 0
              ? "border-card-border bg-card"
              : "border-card-border/40 bg-card/40",
          isChanged && "ring-2 ring-success/50"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 border-b px-4 py-2.5 text-sm font-bold",
            isOrphaned
              ? "border-danger/20 text-danger"
              : depth === 0
                ? "border-card-border/60 text-foreground"
                : "border-card-border/30 text-muted-foreground"
          )}
        >
          <span>{item.label}</span>
          {item.address && (
            <span className="ml-auto font-mono text-[11px] font-normal text-muted-foreground">
              {item.address}
            </span>
          )}
          {isOrphaned && (
            <span className="rounded-full bg-danger/20 px-2.5 py-0.5 text-[10px] font-semibold text-danger">
              LEAKED
            </span>
          )}
        </div>
        <div className="flex flex-col gap-0.5 p-2.5">
          {visibleChildren(item).map((child) => (
            <MemoryBlock key={child.id} item={child} depth={depth + 1} />
          ))}
          {item.children!.length > visibleChildren(item).length && (
            <p className="px-3 py-1 text-xs italic text-muted" data-array-rest>
              … {item.children!.length - visibleChildren(item).length} more element
              {item.children!.length - visibleChildren(item).length === 1 ? "" : "s"} not shown
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-cell-id={item.id}
      data-changed={isChanged || undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-4 py-2 text-sm transition-all duration-300",
        isChanged && "cell-changed",
        isOrphaned && "opacity-40"
      )}
    >
      <span className="min-w-0 shrink-0 font-medium text-muted-foreground">
        {item.label}
        {item.address && (
          <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
            {item.address}
          </span>
        )}
      </span>
      <span className="text-muted">=</span>
      <span className="min-w-0 font-bold [overflow-wrap:anywhere]">
        {isPointer || item.dangling ? (
          <button
            type="button"
            data-pointer-cell={item.id}
            disabled={!inspect}
            onClick={() => inspect?.select({ kind: "pointer", cellId: item.id })}
            title={inspect ? "Click to inspect this pointer" : undefined}
            className={cn(
              "inline-flex items-center gap-1 rounded focus-visible:outline-2 focus-visible:outline-accent",
              item.dangling ? "bg-danger/15 px-2 py-0.5 text-xs font-bold text-danger" : "px-1 text-sm text-accent enabled:hover:bg-accent/10",
              selected && "bg-accent/20 outline outline-1 outline-accent"
            )}
          >
            {item.dangling ? "dangling" : <><span aria-hidden>→</span><span>{inspect ? <RichText text={targetLabel(inspect.model, item.pointsTo ?? null)} /> : ""}</span></>}
          </button>
        ) : item.value === "nullptr" ? (
          <span className="rounded-md bg-danger/15 px-2 py-0.5 text-xs font-bold text-danger">
            null
          </span>
        ) : item.value === "?" ? (
          <span className="text-lg text-muted">?</span>
        ) : (
          <span className="text-base text-success">{item.value}</span>
        )}
      </span>
    </div>
  );
}
