"use client";

import { runProgram } from "@/runtime";
import { LiveDemo } from "@/ui/landing/live-demo";

// The landing page is pre-rendered on the server; the demo runs its program in the Worker.
export function LiveDemoPlayer() {
  return <LiveDemo run={runProgram} />;
}
