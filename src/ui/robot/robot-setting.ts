// Whether the robot is shown: the student's saved choice, otherwise on, unless the device
// asks for reduced motion.
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "heaphop.robot";
const listeners = new Set<() => void>();
let shown: boolean | null = null;

function read(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved === "on";
  } catch {
    // Storage blocked: use the default.
  }
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const snapshot = () => (shown ??= read());

export function toggleRobot() {
  shown = !snapshot();
  try {
    localStorage.setItem(STORAGE_KEY, shown ? "on" : "off");
  } catch {
    // The choice just is not remembered.
  }
  listeners.forEach((l) => l());
}

export function useRobotShown(): boolean {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot,
    () => false
  );
}
