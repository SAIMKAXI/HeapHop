"use client";

// A link that opens a lesson or example in place; with a modifier key it acts like any link.
import type { MouseEvent, ReactNode } from "react";
import { hrefOf, openPick, type Pick } from "./address";

export function PickLink({ pick, className, children }: { pick: Pick; className: string; children: ReactNode }) {
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openPick(pick);
  };
  return <a href={hrefOf(pick)} onClick={onClick} {...{ [`data-${pick.kind}`]: pick.id }} className={className}>{children}</a>;
}
