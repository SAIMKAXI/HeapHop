"use client";

import { runProgram } from "@/runtime";
import { AppShell } from "@/ui/app-shell";

// The website shell: the shared interface, running programs in the site's Web Worker.
export default function Home() {
  return <AppShell run={runProgram} supportedHref="supported" />;
}
