// The extension ships without Byte. At build time every src/ui/robot module is replaced by
// this file (scripts/build.mjs), so the robot's drawing and animation code is not in the
// panel at all. The canvas is told `robot={false}` as well, so nothing here is ever called.
export class RobotPlayer {
  standingOn: string | null = null;
  place(): void {}
  play(): Promise<void> { return Promise.resolve(); }
  cancel(): void {}
}
export const useRobotShown = (): boolean => false;
export const toggleRobot = (): void => {};
export const RobotSprite = (): null => null;
export const ROBOT_HAND = { x: 0, y: 0 };
export const REACH = "";
