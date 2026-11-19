// Byte, large, hovering beside the slogan on the landing page.
import { RobotSprite } from "@/ui/robot/robot-sprite";

export function ByteHero() {
  return (
    <figure data-byte-hero className="flex flex-col items-center">
      <div className="relative isolate">
        <div className="absolute inset-x-[-25%] inset-y-[10%] -z-10 rounded-full bg-accent/15 blur-3xl" aria-hidden />
        <svg viewBox="-26 -72 52 86" className="hh-hover h-56 w-auto sm:h-72 lg:h-[22rem]" aria-hidden>
          <RobotSprite thrust />
        </svg>
      </div>
      <div className="hh-hover-shadow h-3 w-28 rounded-full bg-accent/30 blur-sm" aria-hidden />
      <figcaption className="mt-5 rounded-full border border-card-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
        <span className="font-bold text-accent">Byte</span> · your pointer-pushing sidekick
      </figcaption>
    </figure>
  );
}
