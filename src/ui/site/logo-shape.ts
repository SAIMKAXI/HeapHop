// The HeapHop mark: an H whose crossbar carries four linked nodes. One copy of the
// geometry, shared by the logo component and checked against src/app/icon.svg by a test.
// Units are a 100 × 100 box; VIEW_BOX trims it to the drawing.

export const LOGO_VIEW_BOX = "4 5 92 92";

export const LOGO_SHAPE = {
  leftBar: "M10 25Q10 20 14.5 17.8L28.5 11.2Q33 9 33 14L33 71Q33 76 28.5 78.2L14.5 84.8Q10 87 10 82Z",
  crossbar: "M32.6 40.2Q46 33 64 31L64 69Q47 62 32.6 63.8Z",
  rightBar: "M63 25Q63 20 67.5 18L87.5 9.6Q92 7.7 92 12.6L92 81Q92 86 87.4 87.5L63.6 95.6Q59 97 59 92L59 72L63 40Z",
  /** The two light swooshes cut out of the H, so the page shows through them. */
  sweep: "M8 56Q24 38.5 58 31.6Q27 42.5 8 60.5Z",
  chevron: "M57 26.5Q80 30.5 89.6 47Q79 56.5 57 71Q75 55.5 81.5 47Q74 36.5 57 30.5Z",
  /** The links between the nodes, with a tail back to the left bar. */
  links: "M25 61L40.6 49L63 36L79 50.7L59 61L40.6 49",
} as const;

export const LOGO_NODES = [
  { cx: 40.6, cy: 49, r: 5, tone: "teal" },
  { cx: 79, cy: 50.7, r: 5, tone: "teal" },
  { cx: 63, cy: 36, r: 4.6, tone: "amber" },
  { cx: 59, cy: 61, r: 4, tone: "amber" },
] as const;

/** The highlight on the top node. */
export const LOGO_GLINT = { cx: 62.3, cy: 35.2, r: 2 } as const;
