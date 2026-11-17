// Shapes produced by the layout engine. Plain numbers only: no DOM, no React.
// World coordinates are in pixels at 100% zoom; the viewport scales them.

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }

/** One line inside a node box: a field or an array element. */
export interface FieldRow {
  /** Id of the memory cell shown on this line. */
  cellId: string;
  /** "data", "next", "inner.x", "[2]" */
  label: string;
  /** Vertical centre of the line, measured from the top of the box. */
  y: number;
}

export interface NodeBox extends Rect {
  /** Heap object id ("h3"). */
  id: string;
  rows: FieldRow[];
  /** Cells that did not fit (long arrays). */
  hiddenRows: number;
  /** 0 = in its row; 1 = dropped below it (not linked in yet, or no longer reachable). */
  level: 0 | 1;
  /** List family (row band), -2 for a tree node, -1 for any other object. */
  family: number;
}

export type ArrowKind = "next" | "prev" | "other";

export interface Arrow {
  /** Id of the pointer cell the arrow starts from. Stable across steps. */
  id: string;
  from: string;
  to: string;
  kind: ArrowKind;
  /** SVG path data. */
  path: string;
  start: Point;
  end: Point;
}

/** What is drawn where a pointer has no live target. */
export interface Terminal extends Rect {
  /** Id of the pointer cell. */
  id: string;
  nodeId: string;
  label: "NULL" | "?" | "deleted";
  /** Short line from the node to the terminal. */
  stem: { from: Point; to: Point };
}

/** A named stack pointer shown on the node it points at. */
export interface Chip extends Rect {
  /** Id of the stack pointer cell, or "more:<nodeId>" for the overflow chip. */
  id: string;
  label: string;
  nodeId: string;
  frameId: string;
  /** Belongs to the function that is running now. */
  active: boolean;
}

export interface Layout {
  nodes: NodeBox[];
  arrows: Arrow[];
  terminals: Terminal[];
  chips: Chip[];
  /** Everything drawn fits inside this rectangle. */
  bounds: Rect;
}
