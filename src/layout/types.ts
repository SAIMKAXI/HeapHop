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

/** "branch": a tree node's left or right child link, drawn as a branch without an arrowhead. */
export type ArrowKind = "next" | "prev" | "branch" | "other";

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

/** One drawn element of an array. */
export interface ArrayCell extends Rect {
  /** Id of the memory cell. */
  cellId: string;
  index: number;
  /** For a 2-D array: the cell's row and column (index is row * columns + column). */
  row?: number;
  col?: number;
  /** What the cell shows: the value, "NULL", "?" or "deleted". Empty for a pointer that has an arrow. */
  text: string;
  pointer: boolean;
  /** For a pointer cell: the id of the cell it points at. */
  pointsTo?: string;
  /** The value changed in this step. */
  changed: boolean;
  /** This step read the value (e.g. a comparison looked at it). */
  read: boolean;
}

/** An index variable (top, front, i, j...) shown as a tag above the cell it names. */
export interface ArrayMarker extends Rect {
  /** Id of the int variable. */
  id: string;
  label: string;
  /** May be -1 or the array's length: just outside the cells. For a 2-D array, a row or column number. */
  index: number;
  /** 2-D arrays: "row" tags sit left of their row, "col" tags above their column. */
  axis?: "row" | "col";
  /** Belongs to the function that is running now. */
  active: boolean;
}

/** An array used as a binary heap, also drawn as the complete tree it stands for. */
export interface HeapView {
  nodes: (Rect & { cellId: string; index: number; text: string; changed: boolean; read: boolean })[];
  edges: { from: Point; to: Point }[];
}

/** A graph read from an adjacency matrix or adjacency list: vertices on a circle, joined by edges. */
export interface GraphView {
  vertices: (Rect & {
    index: number;
    /** True in the program's visited / inMST / done array. */
    visited: boolean;
    /** The vertex the running code is working on (the row it is reading). */
    current: boolean;
    /** From a dist / key array: the value, or "∞". */
    label?: string;
  })[];
  edges: { from: Point; to: Point; directed: boolean; weight?: string; labelAt?: Point; /** Being looked at right now. */ active: boolean }[];
}

/** An array drawn as a row of cells, with its index labels and markers. */
export interface ArrayStrip extends Rect {
  /** Id of the array's memory cell ("f0_values", "f0_s_arr", "h3"). */
  id: string;
  /** "values", "s.arr"; empty for a heap array (the canvas names it). */
  title: string;
  /** Function whose stack frame holds the array, or "heap". */
  owner: string;
  length: number;
  /** Top of the cells, in world coordinates. */
  cellsY: number;
  cells: ArrayCell[];
  /** Cells before / after the drawn window, for long arrays. */
  skippedBefore: number;
  hiddenAfter: number;
  markers: ArrayMarker[];
  heap?: HeapView;
  /** A 2-D array: its cells form a grid; row labels end at `x`, column labels sit above the first row. */
  matrix?: { rows: number; cols: number; x: number; cellW: number; cellH: number };
  graph?: GraphView;
  /** An array stack, drawn as a column (index 0 at the bottom) inside an open-topped container. */
  upright?: boolean;
}

export interface Layout {
  arrays: ArrayStrip[];
  nodes: NodeBox[];
  arrows: Arrow[];
  terminals: Terminal[];
  chips: Chip[];
  /** Everything drawn fits inside this rectangle. */
  bounds: Rect;
}
