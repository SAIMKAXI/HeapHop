"use client";

import { runProgram } from "@/runtime";
import { LearnShell } from "@/ui/learn/learn-shell";

export default function LearnPage() {
  return <LearnShell run={runProgram} />;
}
