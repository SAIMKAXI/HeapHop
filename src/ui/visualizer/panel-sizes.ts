// Widths of the code and stack panels in the visualizer, as the student last set them.
// Kept in localStorage so they survive a reload.
export interface PanelSizes {
  code: number;
  stack: number;
}

export const DEFAULT_SIZES: PanelSizes = { code: 400, stack: 300 };
export const MIN_SIZES: PanelSizes = { code: 240, stack: 200 };
/** The heap panel always keeps at least this much room. */
export const MIN_HEAP = 320;

const STORAGE_KEY = "heaphop.panels";

export function loadSizes(): PanelSizes {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<PanelSizes> | null;
    if (saved && typeof saved.code === "number" && typeof saved.stack === "number") {
      return { code: Math.max(saved.code, MIN_SIZES.code), stack: Math.max(saved.stack, MIN_SIZES.stack) };
    }
  } catch {
    // Storage blocked or damaged: use the defaults.
  }
  return DEFAULT_SIZES;
}

export function saveSizes(sizes: PanelSizes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    // The sizes just are not remembered.
  }
}
