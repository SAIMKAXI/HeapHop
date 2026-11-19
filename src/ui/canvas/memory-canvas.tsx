"use client";

// The heap drawn as SVG from layout coordinates (tasks 5.3 to 5.8).
// Nothing here measures the DOM to place a node or an arrow: positions come from
// src/layout, which is why the picture stays correct at any zoom.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ListPlan } from "@/core/structures";
import { heapRootOf, type Selection, type TraceModel } from "@/core/trace";
import { cellLabel, targetLabel } from "@/core/explain";
import { RichText } from "@/ui/rich-text";
import { intersects, planRobotMove, robotHome, visibleWorldRect, type Rect, type Size, type View } from "@/layout";
import { RobotPlayer } from "@/ui/robot/robot-player";
import { useRobotShown, toggleRobot } from "@/ui/robot/robot-setting";
import { RobotSprite } from "@/ui/robot/robot-sprite";
import { ArrayView } from "./array-view";
import { CanvasToolbar } from "./canvas-toolbar";
import { computeStep, traceBounds, unionRect } from "./layout-cache";
import { NodeView } from "./node-view";
import { useViewport } from "./use-viewport";

interface MemoryCanvasProps {
  model: TraceModel;
  plan: ListPlan;
  stepIndex: number;
  selection?: Selection | null;
  /** Objects related to the selection (outlined). */
  highlighted?: Set<string>;
  onSelect?: (selection: Selection | null) => void;
  /** A picture only: no toolbar, no robot, no hover card, and the mouse and wheel pass through to the page. */
  still?: boolean;
  /** The student is stepping by hand, so the robot acts out single steps. Off while playing or jumping. */
  robotMotion?: boolean;
}

const NONE = new Set<string>();

/** Hover card for a node: value, pointer fields and targets, who points at it, where it was created. */
function NodeTooltip({ model, stepIndex, id }: { model: TraceModel; stepIndex: number; id: string }) {
  const view = model.getStep(stepIndex);
  const item = view.heapObject(id);
  const rec = model.object(id);
  if (!item || !rec) return null;
  const fields = item.children ?? [item];
  const refs = view.incoming(id);
  return (
    <>
      <p className="mb-1 text-xs font-bold">{rec.displayName}{item.orphaned ? " · unreachable" : ""}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-[11px]">
        {fields.filter((f) => !f.children).slice(0, 6).map((f) => (
          <div key={f.id} className="contents">
            <dt className="font-mono text-muted-foreground">{f.name || "value"}</dt>
            <dd className="font-mono">{f.kind === "pointer" ? (f.pointsTo ? `→ ${targetLabel(model, f.pointsTo)}` : f.dangling ? "deleted" : f.value === "?" ? "?" : "nullptr") : f.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {refs.length === 0 ? "Nothing points at it" : <>Pointed at by <RichText text={refs.map((r) => cellLabel(model, r.owner, r.name, view.step.activeFunction)).join(", ")} /></>}
      </p>
      <p className="text-[11px] text-muted-foreground">Created on line {rec.allocLine}</p>
    </>
  );
}

/** Lists longer than this draw only what is on screen. */
const CULL_ABOVE = 60;
const CULL_MARGIN = 300;
/** The culling window moves in steps of this many pixels, so panning re-renders rarely. */
const CULL_GRID = 240;

const EMPTY_BOUNDS: Rect = { x: 0, y: 0, width: 0, height: 0 };
const ARROW_CLASS = { next: "stroke-accent", prev: "stroke-prev", branch: "stroke-accent/60", other: "stroke-muted-foreground" } as const;

export function MemoryCanvas({ model, plan, stepIndex, selection = null, highlighted = NONE, onSelect, still = false, robotMotion = false }: MemoryCanvasProps) {
  const selectedId = selection?.kind === "object" ? selection.id : null;
  const selectedCell = selection?.kind === "pointer" ? selection.cellId : null;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const boundsRef = useRef<Rect>(EMPTY_BOUNDS);

  const { structures, layout, items, boxes } = computeStep(model, plan, stepIndex);
  const born = new Set(model.events[stepIndex]?.flatMap((e) => (e.type === "alloc" ? [e.objectId] : [])));
  const frame = traceBounds(model, plan);

  // The robot: placed at home when it appears, then acting out each single step by hand.
  const robotShown = useRobotShown() && !still;
  const svgRef = useRef<SVGSVGElement>(null);
  const robotRef = useRef<SVGGElement>(null);
  const liveRef = useRef<SVGPathElement>(null);
  const ghostRef = useRef<SVGRectElement>(null);
  const playerRef = useRef<RobotPlayer | null>(null);
  const shownStep = useRef(stepIndex);
  useLayoutEffect(() => {
    const svg = svgRef.current, robot = robotRef.current, live = liveRef.current, ghost = ghostRef.current;
    if (!robotShown || !svg || !robot || !live || !ghost) return;
    const part = <T extends SVGElement>(name: string) => robot.querySelector(`[data-part="${name}"]`) as T;
    const player = new RobotPlayer({ svg, robot, live, ghost, flame: part("flame"), arm: part("arm"), hand: part("hand") });
    player.place(robotHome(frame), null);
    playerRef.current = player;
    return () => { player.cancel(); playerRef.current = null; };
  }, [robotShown, frame]);
  useLayoutEffect(() => {
    const from = shownStep.current;
    shownStep.current = stepIndex;
    const player = playerRef.current;
    if (!player || from === stepIndex) return;
    const home = robotHome(frame);
    if (!robotMotion || Math.abs(stepIndex - from) !== 1) return player.place(home, null);
    void player.play(planRobotMove({
      events: model.events[Math.max(from, stepIndex)],
      direction: stepIndex > from ? 1 : -1,
      before: computeStep(model, plan, from).layout,
      after: layout,
      standingOn: player.standingOn,
      home,
      atEnd: stepIndex === 0 || stepIndex === model.length - 1,
    }));
  }, [stepIndex, robotMotion, model, plan, layout, frame]);

  // Culling window: only tracked for large pictures, and only updated when it moves a grid cell.
  const large = layout.nodes.length > CULL_ABOVE;
  const largeRef = useRef(large);
  useEffect(() => { largeRef.current = large; }, [large]);
  const [windowRect, setWindowRect] = useState<Rect | null>(null);
  const onViewChange = useCallback((view: View, size: Size) => {
    if (!largeRef.current) return;
    const r = visibleWorldRect(view, size, CULL_MARGIN);
    const snap = (n: number) => Math.floor(n / CULL_GRID) * CULL_GRID;
    const next = { x: snap(r.x), y: snap(r.y), width: snap(r.width) + 2 * CULL_GRID, height: snap(r.height) + 2 * CULL_GRID };
    setWindowRect((prev) => (prev && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height ? prev : next));
  }, []);

  const viewport = useViewport({ containerRef, contentRef, percentRef, boundsRef, onViewChange });

  // The camera frames the whole run, so it does not jump from step to step. It refits
  // only if a step needs more room, and never after the student has moved it (until Fit).
  useEffect(() => {
    const needed = unionRect(frame, layout.bounds);
    const prev = boundsRef.current;
    const same = prev.x === needed.x && prev.y === needed.y && prev.width === needed.width && prev.height === needed.height;
    boundsRef.current = needed;
    if (!same && viewport.following()) viewport.frame();
  }, [frame, layout, viewport]);

  // Fullscreen: the browser's own where it exists, otherwise the canvas fills the window
  // (a VS Code webview has no fullscreen API). Escape leaves either.
  const [fullscreen, setFullscreen] = useState<"off" | "browser" | "window">("off");
  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (fullscreen === "window") setFullscreen("off");
    else if (el?.requestFullscreen) el.requestFullscreen().catch(() => setFullscreen("window"));
    else setFullscreen("window");
  }, [fullscreen]);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapperRef.current ? "browser" : "off");
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen((f) => (f === "window" ? "off" : f)); };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("fullscreenchange", onChange); window.removeEventListener("keydown", onKey); };
  }, []);

  const nameOf = useCallback((id: string) => model.nameOf(id), [model]);
  const selectObject = useCallback((id: string) => onSelect?.({ kind: "object", id }), [onSelect]);
  const selectCell = useCallback((cellId: string) => onSelect?.({ kind: "pointer", cellId }), [onSelect]);

  // Hover card: which node is under the pointer is state; where the card sits is written
  // straight to its style, so moving the mouse does not re-render anything.
  const [hoverId, setHoverId] = useState<string | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = (e.target as Element).closest?.("[data-node-id]");
    const id = el && !e.currentTarget.dataset.dragging ? el.getAttribute("data-node-id") : null;
    setHoverId((prev) => (prev === id ? prev : id));
    const tip = tipRef.current;
    if (!tip) return;
    // Beside the pointer, flipped to the other side when it would leave the window.
    const x = e.clientX + 14 + tip.offsetWidth > innerWidth ? e.clientX - 14 - tip.offsetWidth : e.clientX + 14;
    const y = e.clientY + 16 + tip.offsetHeight > innerHeight ? e.clientY - 16 - tip.offsetHeight : e.clientY + 16;
    tip.style.transform = `translate(${Math.max(0, x)}px, ${Math.max(0, y)}px)`;
  };

  const visible = large && windowRect ? new Set(layout.nodes.filter((n) => intersects(windowRect, n)).map((n) => n.id)) : null;
  const shown = (id: string) => !visible || visible.has(id);

  const selectedBox = selectedId ? boxes.get(selectedId) : undefined;
  const summary = structures.lists
    .filter((l) => l.nodes.length > 1)
    .map((l) => `${l.kind} linked list · ${l.nodes.length} nodes`)
    .concat(structures.trees.filter((t) => t.nodes.length > 1).map((t) => `binary tree · ${t.nodes.length} nodes`));

  return (
    <div
      ref={wrapperRef}
      className={fullscreen === "window" ? "fixed inset-0 z-50 bg-background" : "absolute inset-0 bg-background"}
    >
      {!still && (
        <CanvasToolbar
          viewport={viewport}
          percentRef={percentRef}
          canFocus={!!selectedBox}
          onFocus={() => selectedBox && viewport.focus(selectedBox)}
          fullscreen={fullscreen !== "off"}
          onToggleFullscreen={toggleFullscreen}
          robot={robotShown}
          onToggleRobot={toggleRobot}
        />
      )}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-1">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Heap</h3>
        {summary.map((s, i) => (
          <span key={i} data-list-kind className="w-fit rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent">{s}</span>
        ))}
      </div>
      <div
        ref={containerRef}
        className={still ? "hh-canvas pointer-events-none relative h-full w-full overflow-hidden" : "hh-canvas relative h-full w-full touch-none overflow-hidden"}
        data-lod="full"
        data-node-count={layout.nodes.length}
        onClick={onSelect ? () => onSelect(null) : undefined}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverId(null)}
      >
        {layout.nodes.length === 0 && layout.arrays.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-sm italic text-muted">The heap is empty</p>
        )}
        {/* The zoom and pan transform sits on this HTML layer, which the browser can move
            and scale without repainting the drawing. */}
        <div ref={contentRef} className="hh-content absolute left-0 top-0">
        <svg ref={svgRef} width={1} height={1} overflow="visible" role="img" aria-label="Heap memory diagram">
          <defs>
            {(["next", "prev", "other"] as const).map((kind) => (
              <marker key={kind} id={`hh-arrow-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" className={kind === "next" ? "fill-accent" : kind === "prev" ? "fill-prev" : "fill-muted-foreground"} />
              </marker>
            ))}
          </defs>
          <g>
            {layout.arrays.map((strip) => (
              <ArrayView
                key={strip.id} strip={strip}
                title={strip.owner === "heap" ? nameOf(strip.id) : `${strip.title} · ${strip.owner}`}
                selectedCell={selectedCell} onSelectCell={selectCell}
              />
            ))}
            {layout.terminals.filter((t) => shown(t.nodeId)).map((t) => (
              <g key={t.id} data-terminal={t.label} data-terminal-id={t.id} className="hh-fade">
                <line x1={t.stem.from.x} y1={t.stem.from.y} x2={t.stem.to.x} y2={t.stem.to.y} className={t.label === "?" ? "stroke-muted" : "stroke-danger/70"} strokeWidth={1.5} strokeDasharray={t.label === "?" ? "3 3" : undefined} />
                <rect x={t.x} y={t.y} width={t.width} height={t.height} rx={5} className={t.label === "?" ? "fill-card stroke-muted" : "fill-danger-dim stroke-danger/60"} strokeWidth={1} />
                <text x={t.x + t.width / 2} y={t.y + 14} textAnchor="middle" className={`hh-detail text-[10px] font-bold ${t.label === "?" ? "fill-muted" : "fill-danger"}`}>{t.label}</text>
              </g>
            ))}
            {layout.nodes.filter((n) => shown(n.id)).map((box) => {
              const item = items.get(box.id);
              if (!item) return null;
              return (
                <NodeView
                  key={box.id} item={item} box={box} title={nameOf(box.id)}
                  selected={selectedId === box.id}
                  highlighted={selectedId !== box.id && highlighted.has(box.id)}
                  selectedCell={selectedCell && heapRootOf(selectedCell) === box.id ? selectedCell : null}
                  nameOf={nameOf} onSelect={selectObject} onSelectCell={selectCell}
                  born={born.has(box.id)}
                />
              );
            })}
            {layout.arrows.filter((a) => shown(a.from) || shown(a.to)).map((a) => (
              <g key={`${a.id}>${a.to}:${a.path}`} className="hh-fade hh-arrow" data-arrow-id={a.id} data-arrow-kind={a.kind} data-selected={selectedCell === a.id || undefined}
                onClick={(e) => { e.stopPropagation(); selectCell(a.id); }}>
                <path d={a.path} fill="none" strokeWidth={selectedCell === a.id ? 3.5 : a.kind === "branch" ? 2.75 : 2} strokeLinecap="round" className={ARROW_CLASS[a.kind]} markerEnd={a.kind === "branch" ? undefined : `url(#hh-arrow-${a.kind})`} />
                {/* A wide invisible stroke makes the arrow easy to click. */}
                <path d={a.path} fill="none" stroke="transparent" strokeWidth={14} />
              </g>
            ))}
            {layout.chips.filter((c) => shown(c.nodeId)).map((c) => (
              <g key={c.id} data-chip={c.label} data-chip-id={c.id} data-chip-node={c.nodeId} className="hh-chip" style={{ transform: `translate(${c.x}px, ${c.y}px)` }}
                onClick={c.id.startsWith("more:") ? undefined : (e) => { e.stopPropagation(); selectCell(c.id); }}>
                <rect width={c.width} height={c.height} rx={c.height / 2} className={selectedCell === c.id ? "fill-accent stroke-foreground" : c.active ? "fill-accent" : "fill-card stroke-card-border"} strokeWidth={selectedCell === c.id ? 2 : 1} />
                <text x={c.width / 2} y={14} textAnchor="middle" className={`hh-detail text-[11px] font-bold ${c.active ? "fill-on-accent" : "fill-muted-foreground"}`}>{c.label}</text>
              </g>
            ))}
          </g>
          {robotShown && (
            <g data-robot className="pointer-events-none" aria-hidden>
              <rect ref={ghostRef} rx={8} className="fill-card stroke-accent" strokeWidth={1.5} strokeDasharray="5 4" style={{ display: "none" }} />
              <path ref={liveRef} fill="none" strokeWidth={2} strokeLinecap="round" className="stroke-accent" markerEnd="url(#hh-arrow-next)" style={{ display: "none" }} />
              <g ref={robotRef}><RobotSprite /></g>
            </g>
          )}
        </svg>
        </div>
      </div>
      <div
        ref={tipRef}
        role="tooltip"
        data-node-tooltip
        className={`pointer-events-none fixed left-0 top-0 z-50 max-w-[260px] rounded-lg border border-card-border bg-card px-3 py-2 shadow-xl ${hoverId ? "" : "hidden"}`}
      >
        {hoverId && <NodeTooltip model={model} stepIndex={stepIndex} id={hoverId} />}
      </div>
    </div>
  );
}
