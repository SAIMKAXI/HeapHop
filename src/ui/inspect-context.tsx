"use client";

// Shared by every panel that shows memory: what is selected, and how to select.
import { createContext, useContext } from "react";
import type { Selection, TraceModel } from "@/core/trace";

export interface InspectApi {
  model: TraceModel;
  stepIndex: number;
  selection: Selection | null;
  select: (selection: Selection | null) => void;
  jump: (step: number) => void;
}

export const InspectContext = createContext<InspectApi | null>(null);

/** Null outside a visualizer (the components then simply are not clickable). */
export function useInspect(): InspectApi | null {
  return useContext(InspectContext);
}
