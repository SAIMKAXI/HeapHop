"use client";

import { runProgram } from "@/runtime";
import { EditorShell } from "@/ui/editor/editor-shell";

export default function EditorPage() {
  return <EditorShell run={runProgram} />;
}
