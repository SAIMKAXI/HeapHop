"use client";
import { AsideText } from "./form-bits";
// three.js itself is imported inside HeapScene after the page is ready, so it never slows the form.
import { HeapScene } from "./heap-scene";

export function LoginAside() {
  return (
    <div>
      <AsideText kicker="Welcome back" title="Pick up where your pointers left off.">
        A linked list, live in 3D. <code className="font-mono text-accent">cur</code> walks it one node at a time, just like your loop does.
      </AsideText>
      <div className="relative h-[24rem] overflow-hidden rounded-2xl border-2 border-card-border bg-card/40">
        <HeapScene />
      </div>
    </div>
  );
}
