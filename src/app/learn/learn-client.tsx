"use client";

// Learn runs programs in a Web Worker, so the shell is a client component; the pages only pick the topic.
import { runProgram } from "@/runtime";
import { LearnShell } from "@/ui/learn/learn-shell";

export function LearnClient({ topic }: { topic?: string }) {
  return <LearnShell run={runProgram} topic={topic} />;
}
