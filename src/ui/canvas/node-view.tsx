"use client";

// One heap object drawn from layout coordinates. Memoized: a step that
// changes two nodes re-renders two nodes.
import { memo } from "react";
import type { MemoryItem } from "@/core/types";
import { HEADER_H, ROW_H, type NodeBox } from "@/layout";

interface NodeViewProps {
  item: MemoryItem;
  box: NodeBox;
  /** "Node #2" */
  title: string;
  selected: boolean;
  /** Related to the current selection (for example touched by the selected line). */
  highlighted: boolean;
  /** Id of the selected pointer cell, if it is one of this node's fields. */
  selectedCell: string | null;
  /** Friendly name of a heap object, for pointer fields. */
  nameOf: (id: string) => string;
  onSelect?: (id: string) => void;
  /** A pointer field was clicked. */
  onSelectCell?: (cellId: string) => void;
}

function findCell(item: MemoryItem, id: string): MemoryItem | undefined {
  if (item.id === id) return item;
  for (const c of item.children ?? []) {
    const hit = findCell(c, id);
    if (hit) return hit;
  }
  return undefined;
}

function valueText(cell: MemoryItem, nameOf: (id: string) => string): { text: string; tone: string } {
  if (cell.kind === "pointer") {
    if (cell.pointsTo) return { text: `→ ${nameOf(cell.pointsTo)}`, tone: "fill-accent" };
    if (cell.dangling) return { text: "deleted", tone: "fill-danger" };
    if (cell.value === "?") return { text: "?", tone: "fill-muted" };
    return { text: "NULL", tone: "fill-danger" };
  }
  if (cell.value === "?") return { text: "?", tone: "fill-muted" };
  return { text: cell.value ?? "", tone: "fill-success" };
}

function NodeViewImpl({ item, box, title, selected, highlighted, selectedCell, nameOf, onSelect, onSelectCell }: NodeViewProps) {
  const waiting = box.level === 1 && !item.orphaned;
  return (
    <g
      className="hh-node"
      style={{ transform: `translate(${box.x}px, ${box.y}px)` }}
      data-node-id={item.id}
      data-selected={selected || undefined}
      data-highlighted={highlighted || undefined}
      data-orphaned={item.orphaned || undefined}
      onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(item.id); } : undefined}
      role="button"
      tabIndex={0}
      aria-label={`${title}${item.orphaned ? ", unreachable" : ""}`}
      onKeyDown={onSelect ? (e) => { if (e.key === "Enter") onSelect(item.id); } : undefined}
    >
      <rect
        width={box.width}
        height={box.height}
        rx={10}
        className={
          item.orphaned ? "fill-danger-dim stroke-danger/60"
          : selected ? "fill-card stroke-accent"
          : highlighted ? "fill-card stroke-warning"
          : "fill-card stroke-card-border"
        }
        strokeWidth={selected || highlighted ? 2.5 : 1.5}
        strokeDasharray={item.orphaned || waiting ? "6 4" : undefined}
      />
      <text x={10} y={18} className={`hh-detail text-[12px] font-bold ${item.orphaned ? "fill-danger" : "fill-foreground"}`}>
        {title}
      </text>
      {item.orphaned && (
        <text x={box.width - 8} y={18} textAnchor="end" className="hh-detail fill-danger text-[9px] font-bold uppercase">
          unreachable
        </text>
      )}
      <line x1={0} x2={box.width} y1={HEADER_H - 2} y2={HEADER_H - 2} className="stroke-card-border" strokeWidth={1} />
      {box.rows.map((row) => {
        const cell = findCell(item, row.cellId);
        if (!cell) return null;
        const v = valueText(cell, nameOf);
        return (
          <g
            key={row.cellId}
            data-cell-id={row.cellId}
            className={`hh-detail ${cell.kind === "pointer" ? "hh-pointer-row" : ""}`}
            onClick={cell.kind === "pointer" && onSelectCell ? (e) => { e.stopPropagation(); onSelectCell(row.cellId); } : undefined}
          >
            {selectedCell === row.cellId && (
              <rect x={3} y={row.y - ROW_H / 2 + 1} width={box.width - 6} height={ROW_H - 2} rx={5} className="fill-accent/20" />
            )}
            {cell.changed && (
              <rect key={`${row.cellId}:${v.text}`} x={3} y={row.y - ROW_H / 2 + 1} width={box.width - 6} height={ROW_H - 2} rx={5} className="hh-flash fill-success-dim" />
            )}
            <text x={10} y={row.y + 4} className="fill-muted-foreground text-[11px]">{row.label}</text>
            <text x={box.width - 10} y={row.y + 4} textAnchor="end" className={`${v.tone} text-[12px] font-semibold`}>{v.text}</text>
          </g>
        );
      })}
      {box.hiddenRows > 0 && (
        <text x={10} y={HEADER_H + box.rows.length * ROW_H + ROW_H / 2 + 4} className="hh-detail fill-muted text-[11px] italic">
          … {box.hiddenRows} more
        </text>
      )}
    </g>
  );
}

export const NodeView = memo(NodeViewImpl, (a, b) =>
  a.item === b.item && a.title === b.title && a.selected === b.selected && a.highlighted === b.highlighted &&
  a.selectedCell === b.selectedCell && a.nameOf === b.nameOf &&
  a.onSelect === b.onSelect && a.onSelectCell === b.onSelectCell &&
  a.box.x === b.box.x && a.box.y === b.box.y && a.box.level === b.box.level &&
  a.box.height === b.box.height && a.box.hiddenRows === b.box.hiddenRows
);
