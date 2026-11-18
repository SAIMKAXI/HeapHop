"use client";

// Which step is shown, and every way to move it: buttons, keys, auto-play, and the
// lesson player's "play forward to the next checkpoint". One timer serves both kinds of
// playing.
import { useCallback, useEffect, useState } from "react";
import type { Trace } from "@/core/types";

export const SPEEDS = [0.5, 1, 1.5, 2, 3] as const;
/** Auto-play at 1x waits this long between steps. */
const PLAY_INTERVAL_MS = 1500;
/** The lesson player moves at this pace. */
const TRAVEL_INTERVAL_MS = 240;
/** The lesson player skips ahead so that at most this many steps are played. */
const TRAVEL_MAX_STEPS = 14;

interface Run {
  kind: "play" | "travel";
  until: number;
}

export interface Playback {
  step: number;
  last: number;
  playing: boolean;
  travelling: boolean;
  speed: number;
  goTo(step: number): void;
  next(): void;
  prev(): void;
  first(): void;
  end(): void;
  /** Runs until the stack is no deeper than it is now: the current call is stepped over. */
  stepOver(): void;
  togglePlay(): void;
  setSpeed(speed: number): void;
  /** Plays forward to `target` (skipping ahead when it is far), or jumps back to it. */
  travelTo(target: number): void;
}

export function usePlayback(trace: Trace, initialStep = 0): Playback {
  const last = trace.steps.length - 1;
  const [step, setStep] = useState(initialStep);
  const [speed, setSpeed] = useState(1);
  const [run, setRun] = useState<Run | null>(null);
  const active = run !== null && step < run.until;

  const goTo = useCallback((target: number) => {
    setRun(null);
    setStep(Math.max(0, Math.min(target, last)));
  }, [last]);

  useEffect(() => {
    if (!active || !run) return;
    const interval = run.kind === "travel" ? TRAVEL_INTERVAL_MS : Math.round(PLAY_INTERVAL_MS / speed);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, run.until)), interval);
    return () => clearInterval(timer);
  }, [active, run, speed]);

  const stepOver = useCallback(() => {
    setRun(null);
    setStep((s) => {
      const depth = trace.steps[s].stack.length;
      const back = trace.steps.findIndex((st, i) => i > s && st.stack.length <= depth);
      return back === -1 ? last : back;
    });
  }, [trace.steps, last]);

  return {
    step,
    last,
    playing: active && run?.kind === "play",
    travelling: active && run?.kind === "travel",
    speed,
    goTo,
    next: () => goTo(step + 1),
    prev: () => goTo(step - 1),
    first: () => goTo(0),
    end: () => goTo(last),
    stepOver,
    togglePlay: () => setRun(active && run?.kind === "play" ? null : { kind: "play", until: last }),
    setSpeed,
    travelTo: (target) => {
      if (target <= step) { goTo(target); return; }
      setStep(Math.max(step, target - TRAVEL_MAX_STEPS));
      setRun({ kind: "travel", until: Math.min(target, last) });
    },
  };
}

/** Elements that use Space and Enter themselves. Arrows still step when one is focused. */
const PRESSABLE = "button, a, summary, [role='button']";
/** Elements that use every key themselves. */
const TYPING = "input, textarea, select, [contenteditable='true'], [role='separator']";

/** Keyboard shortcuts of the visualizer: ← → Space, S (step over), R (restart), Esc. */
export function useStepKeys(playback: Playback, onEscape: () => void) {
  const { next, prev, first, stepOver } = playback;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target instanceof Element ? e.target : null;
      if (e.key === "Escape") { onEscape(); return; }
      if (target?.closest(TYPING) || e.altKey || e.ctrlKey || e.metaKey) return;
      const pressable = !!target?.closest(PRESSABLE);
      const action = {
        ArrowRight: next,
        ArrowLeft: prev,
        " ": pressable ? null : next,
        s: stepOver,
        r: first,
      }[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, first, stepOver, onEscape]);
}
