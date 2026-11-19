"use client";

// An array drawn from layout coordinates (tasks 11.4 and 11.6): touching cells with their
// index below (a grid with row and column numbers for a 2-D array), amber tags for index
// variables (top, front, i, j...), cells the current step read outlined in amber, for a
// heap the same values as a tree, and for an adjacency matrix or list the graph itself.
// Memoized like NodeView: a step that changes one array re-renders one array.
import { memo } from "react";
import { CELL_H, type ArrayStrip } from "@/layout";

interface ArrayViewProps {
  strip: ArrayStrip;
  title: string;
  selectedCell: string | null;
  /** A pointer cell was clicked. */
  onSelectCell?: (cellId: string) => void;
}

const cellClass = (read: boolean, empty: boolean) =>
  read ? "fill-prev/15 stroke-prev" : empty ? "fill-card stroke-card-border" : "fill-card stroke-accent/50";

function ArrayViewImpl({ strip, title, selectedCell, onSelectCell }: ArrayViewProps) {
  const first = strip.cells[0];
  const end = strip.cells.at(-1);
  const grid = strip.matrix;
  return (
    <g data-array={strip.id} data-array-length={strip.length} data-matrix={grid ? `${grid.rows}x${grid.cols}` : undefined}>
      <text x={strip.x} y={strip.y + 13} className="hh-detail fill-muted-foreground text-[12px] font-bold">
        {title}
        <tspan className="font-normal"> · {grid ? `${strip.length} × ${grid.cols}` : `${strip.length} cell${strip.length === 1 ? "" : "s"}`}</tspan>
      </text>
      {grid && Array.from({ length: grid.cols }, (_, c) => (
        <text key={`c${c}`} x={grid.x + c * grid.cellW + grid.cellW / 2} y={strip.cellsY - 5} textAnchor="middle" className="hh-detail fill-muted text-[10px]">{c}</text>
      ))}
      {grid && Array.from({ length: grid.rows }, (_, r) => (
        <text key={`r${r}`} x={grid.x - 6} y={strip.cellsY + r * grid.cellH + grid.cellH / 2 + 4} textAnchor="end" className="hh-detail fill-muted text-[10px]">{r}</text>
      ))}
      {strip.skippedBefore > 0 && first && (
        <text x={first.x - 24} y={first.y + CELL_H / 2 + 4} textAnchor="middle" className="fill-muted text-[12px]">…</text>
      )}
      {strip.cells.map((c) => (
        <g
          key={c.cellId} data-array-cell={c.cellId} data-index={c.index} data-read={c.read || undefined} data-changed={c.changed || undefined}
          className={c.changed ? "hh-flash" : undefined}
          onClick={c.pointer && onSelectCell ? (e) => { e.stopPropagation(); onSelectCell(c.cellId); } : undefined}
        >
          <rect
            x={c.x} y={c.y} width={c.width} height={c.height}
            className={selectedCell === c.cellId ? "fill-accent/15 stroke-accent" : cellClass(c.read, c.text === "?")}
            strokeWidth={c.read || selectedCell === c.cellId ? 2 : 1}
            strokeDasharray={c.text === "?" ? "3 3" : undefined}
          />
          {c.pointer && c.pointsTo ? (
            <circle cx={c.x + c.width / 2} cy={c.y + c.height - 6} r={3.5} className="fill-accent" />
          ) : (
            <text
              x={c.x + c.width / 2} y={c.y + c.height / 2 + 5} textAnchor="middle"
              className={`${c.text === "NULL" || c.text === "deleted" ? "fill-danger text-[10px]" : c.text === "?" ? "fill-muted text-[13px]" : grid ? (c.text === "0" ? "fill-muted text-[12px]" : "fill-foreground text-[12px]") : "fill-foreground text-[14px]"} font-bold`}
            >
              {c.text}
            </text>
          )}
          {!grid && <text x={c.x + c.width / 2} y={c.y + c.height + 13} textAnchor="middle" className="hh-detail fill-muted text-[10px]">{c.index}</text>}
        </g>
      ))}
      {strip.hiddenAfter > 0 && end && (
        <text x={end.x + end.width + 8} y={end.y + CELL_H / 2 + 4} className="hh-detail fill-muted text-[11px]">+{strip.hiddenAfter} more</text>
      )}
      {strip.markers.map((m) => (
        <g key={m.id} data-marker={m.label} data-marker-index={m.index} className="hh-chip" style={{ transform: `translate(${m.x}px, ${m.y}px)` }}>
          <rect width={m.width} height={m.height} rx={m.height / 2} className={m.active ? "fill-prev" : "fill-card stroke-prev/60"} strokeWidth={1} />
          <text x={m.width / 2} y={13} textAnchor="middle" className={`hh-detail text-[11px] font-bold ${m.active ? "fill-on-accent" : "fill-prev"}`}>{m.label}</text>
        </g>
      ))}
      {strip.graph && (
        <g data-graph-view>
          {strip.graph.edges.map((e, i) => (
            <g key={i} data-graph-edge={e.active || undefined}>
              <line x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} className={e.active ? "stroke-prev" : "stroke-accent/60"} strokeWidth={e.active ? 3 : 2} strokeLinecap="round"
                markerEnd={e.directed ? `url(#hh-arrow-${e.active ? "prev" : "next"})` : undefined} />
              {e.weight && e.labelAt && (
                <text x={e.labelAt.x} y={e.labelAt.y + 4} textAnchor="middle" className="fill-foreground stroke-background text-[11px] font-bold" strokeWidth={3} style={{ paintOrder: "stroke" }}>{e.weight}</text>
              )}
            </g>
          ))}
          {strip.graph.vertices.map((v) => (
            <g key={v.index} data-vertex={v.index} data-visited={v.visited || undefined} data-current={v.current || undefined}>
              <circle cx={v.x + v.width / 2} cy={v.y + v.height / 2} r={v.width / 2}
                className={`${v.visited ? "fill-accent/25" : "fill-card"} ${v.current ? "stroke-prev" : "stroke-accent/70"}`} strokeWidth={v.current ? 3 : 1.5} />
              <text x={v.x + v.width / 2} y={v.y + v.height / 2 + 5} textAnchor="middle" className="fill-foreground text-[13px] font-bold">{v.index}</text>
              {v.label && <text x={v.x + v.width / 2} y={v.y + v.height + 13} textAnchor="middle" className="fill-muted-foreground text-[11px] font-bold">{v.label}</text>}
            </g>
          ))}
        </g>
      )}
      {strip.heap && (
        <g data-heap-view>
          {strip.heap.edges.map((e, i) => (
            <line key={i} x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} className="stroke-accent/60" strokeWidth={2} strokeLinecap="round" />
          ))}
          {strip.heap.nodes.map((n) => (
            <g key={n.cellId} data-heap-node={n.index} className={n.changed ? "hh-flash" : undefined}>
              <circle cx={n.x + n.width / 2} cy={n.y + n.height / 2} r={n.width / 2} className={n.read ? "fill-prev/15 stroke-prev" : "fill-card stroke-accent/60"} strokeWidth={n.read ? 2 : 1.5} />
              <text x={n.x + n.width / 2} y={n.y + n.height / 2 + 4} textAnchor="middle" className="fill-foreground text-[12px] font-bold">{n.text}</text>
            </g>
          ))}
        </g>
      )}
    </g>
  );
}

export const ArrayView = memo(ArrayViewImpl);
