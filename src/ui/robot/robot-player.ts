// Plays the robot's beats (src/layout/robot.ts) on its SVG parts, one animation frame at a
// time. It only writes to the robot's own elements and marks hidden arrows and nodes with
// data-robot-hidden, so React keeps owning the picture. A new move cancels the running one,
// which snaps to its end first: stepping never waits for the robot.
import type { Point, RobotBeat, RobotMove } from "@/layout";
import { REACH, ROBOT_HAND } from "./robot-sprite";

export interface RobotParts {
  /** The SVG that holds the picture, searched for the arrows and nodes to hide. */
  svg: SVGSVGElement;
  robot: SVGGElement;
  flame: SVGGElement;
  arm: SVGGElement;
  hand: SVGGElement;
  /** The arrow being dragged. */
  live: SVGPathElement;
  /** The node being carried. */
  ghost: SVGRectElement;
}

const DRAG_MS = 650;
const GHOST_GAP = 2;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const flyMs = (a: Point, b: Point) => Math.min(800, Math.max(320, 280 + Math.hypot(b.x - a.x, b.y - a.y) * 0.9));
const handAt = (p: Point): Point => ({ x: p.x - ROBOT_HAND.x, y: p.y - ROBOT_HAND.y });

class Cancelled extends Error {}

export class RobotPlayer {
  private feet: Point = { x: 0, y: 0 };
  private run = 0;
  private finish: (() => void) | null = null;
  standingOn: string | null = null;

  constructor(private readonly parts: RobotParts) {}

  /** Puts the robot somewhere at once, ending any move. */
  place(feet: Point, standingOn: string | null) {
    this.cancel();
    this.set(feet);
    this.standingOn = standingOn;
  }

  /** Stops the running move and shows its end. */
  cancel() {
    this.run++;
    this.finish?.();
    this.finish = null;
  }

  async play(move: RobotMove) {
    this.cancel();
    const id = this.run;
    const { parts } = this;
    const end = move.beats.at(-1);
    const hidden = move.hide.flatMap((id) => this.drawnFor(id));
    hidden.forEach((el) => el.setAttribute("data-robot-hidden", ""));
    this.standingOn = move.standOn;
    this.finish = () => {
      hidden.forEach((el) => el.removeAttribute("data-robot-hidden"));
      parts.live.style.display = "none";
      parts.ghost.style.display = "none";
      this.pose({ reach: false, grip: false, thrust: false });
      if (end?.kind === "fly") this.set(end.to);
    };
    try {
      for (const beat of move.beats) await this.beat(beat, move.thrust, id);
      this.finish?.();
      this.finish = null;
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
    }
  }

  private async beat(beat: RobotBeat, thrust: boolean, id: number) {
    const { live, ghost } = this.parts;
    if (beat.kind === "fly") return this.fly(beat.to, thrust, id);
    if (beat.kind === "drag") {
      await this.fly(handAt(beat.from), thrust, id, true);
      this.pose({ reach: true, grip: true, thrust });
      live.style.display = "";
      await this.tween(DRAG_MS, id, (e) => {
        const tip = { x: beat.from.x + (beat.to.x - beat.from.x) * e, y: beat.from.y + (beat.to.y - beat.from.y) * e - Math.sin(Math.PI * e) * 28 };
        this.set(handAt(tip));
        const mid = { x: (beat.base.x + tip.x) / 2, y: Math.min(beat.base.y, tip.y) - 24 };
        live.setAttribute("d", `M${beat.base.x} ${beat.base.y} Q${mid.x} ${mid.y} ${tip.x} ${tip.y}`);
      });
      live.style.display = "none";
      this.pose({ reach: false, grip: false, thrust });
      return;
    }
    const { box } = beat;
    const landing = { x: box.x + box.width / 2, y: box.y - GHOST_GAP };
    ghost.setAttribute("width", String(box.width));
    ghost.setAttribute("height", String(box.height));
    if (beat.kind === "drop") {
      // Bring the new node in and set it down in its place.
      ghost.style.display = "";
      ghost.style.opacity = "1";
      this.carryGhost();
      await this.fly(landing, thrust, id, false, true);
      ghost.style.display = "none";
      this.drawnFor(beat.nodeId).forEach((el) => el.removeAttribute("data-robot-hidden"));
      return;
    }
    // Carry a deleted node up and away, fading as it goes.
    await this.fly(landing, thrust, id);
    ghost.style.display = "";
    this.carryGhost();
    const lift = { x: landing.x + 60, y: landing.y - 170 };
    const from = { ...this.feet };
    await this.tween(700, id, (e) => {
      this.set({ x: from.x + (lift.x - from.x) * e, y: from.y + (lift.y - from.y) * e });
      this.carryGhost();
      ghost.style.opacity = String(1 - e);
    });
    ghost.style.display = "none";
  }

  /** What the canvas draws for a pointer cell (its arrow or NULL box), or for a node (the box, its own pointers and the labels on it). */
  private drawnFor(id: string): Element[] {
    const own = id.includes("_") ? `="${id}"` : `^="${id}_"`;
    return [...this.parts.svg.querySelectorAll(`[data-node-id="${id}"], [data-chip-node="${id}"], [data-arrow-id${own}], [data-terminal-id${own}]`)];
  }

  private fly(to: Point, thrust: boolean, id: number, reaching = false, carrying = false) {
    const from = { ...this.feet };
    if (Math.hypot(to.x - from.x, to.y - from.y) < 1) return Promise.resolve();
    this.pose({ reach: reaching, grip: false, thrust });
    return this.tween(flyMs(from, to), id, (e, t) => {
      this.set({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * t) * 30 },
        (to.x > from.x ? 6 : -6) * Math.sin(Math.PI * t));
      if (carrying) this.carryGhost();
      if (thrust) this.parts.flame.setAttribute("transform", `translate(0 462) scale(1 ${0.75 + Math.random() * 0.5}) translate(0 -462)`);
    });
  }

  private tween(ms: number, id: number, frame: (eased: number, t: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const tick = (now: number) => {
        if (id !== this.run) return reject(new Cancelled());
        const t = Math.min(1, (now - start) / ms);
        frame(ease(t), t);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  private carryGhost() {
    const { ghost } = this.parts;
    const w = Number(ghost.getAttribute("width"));
    ghost.setAttribute("x", String(this.feet.x - w / 2));
    ghost.setAttribute("y", String(this.feet.y + GHOST_GAP));
  }

  private pose({ reach, grip, thrust }: { reach: boolean; grip: boolean; thrust: boolean }) {
    const { arm, hand, flame } = this.parts;
    if (reach) arm.setAttribute("transform", REACH); else arm.removeAttribute("transform");
    if (grip) hand.setAttribute("transform", "translate(288 346) scale(0.6 1) translate(-288 -346)"); else hand.removeAttribute("transform");
    flame.style.display = thrust ? "" : "none";
  }

  private set(feet: Point, tilt = 0) {
    this.feet = feet;
    this.parts.robot.setAttribute("transform", `translate(${feet.x} ${feet.y}) rotate(${tilt})`);
  }
}
