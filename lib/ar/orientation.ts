import { Euler, Quaternion, Vector3, MathUtils } from "three";

/**
 * Turns the phone's orientation sensors into a camera rotation.
 *
 * The maths is the classic three.js DeviceOrientationControls example
 * (MIT): alpha/beta/gamma as an intrinsic Z-X'-Y'' euler, then a quarter
 * turn so the camera looks out of the back of the phone, then the screen's
 * own rotation. iOS reports a true compass heading separately
 * (webkitCompassHeading); when it is present it replaces alpha so "north"
 * means north. The balloons do not need true north (they float around the
 * viewer), only the "head NE" arrow does.
 *
 * When no sensor event arrives (desktop, permission refused, old Android)
 * the viewer falls back to dragging a finger to look around; a horizontal
 * drag also adds a yaw offset on top of the sensors.
 */

export type HeadingSource = "absolute" | "compass" | "relative" | "drag" | "none";

const zee = new Vector3(0, 0, 1);
const euler = new Euler();
const q0 = new Quaternion();
const q1 = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

export function quatFromOrientation(out: Quaternion, alphaDeg: number, betaDeg: number, gammaDeg: number, screenDeg: number): Quaternion {
  euler.set(MathUtils.degToRad(betaDeg), MathUtils.degToRad(alphaDeg), -MathUtils.degToRad(gammaDeg), "YXZ");
  out.setFromEuler(euler);
  out.multiply(q1);
  out.multiply(q0.setFromAxisAngle(zee, -MathUtils.degToRad(screenDeg)));
  return out;
}

function screenAngle(): number {
  const o = (typeof screen !== "undefined" && screen.orientation && typeof screen.orientation.angle === "number")
    ? screen.orientation.angle
    : (typeof window !== "undefined" ? Number((window as unknown as { orientation?: number }).orientation ?? 0) : 0);
  return Number.isFinite(o) ? o : 0;
}

type OrientationLike = DeviceOrientationEvent & { webkitCompassHeading?: number; absolute?: boolean };

export class OrientationSource {
  readonly target = new Quaternion();
  source: HeadingSource = "none";
  /** Compass heading 0..360 clockwise from north, or null when unknown. */
  heading: number | null = null;
  private yawOffset = 0;
  private dragYaw = 0;
  private dragPitch = 0;
  private sensorQ = new Quaternion();
  private yawQ = new Quaternion();
  private gotEvent = false;
  private absoluteSeen = false;
  private onAbs = (e: Event) => this.handle(e as OrientationLike, true);
  private onRel = (e: Event) => this.handle(e as OrientationLike, false);
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private autoPanAt = 0;
  private lastInputAt = 0;

  constructor(private onSourceChange?: (s: HeadingSource) => void) {}

  start() {
    if (typeof window === "undefined") return;
    window.addEventListener("deviceorientationabsolute", this.onAbs, true);
    window.addEventListener("deviceorientation", this.onRel, true);
    this.fallbackTimer = setTimeout(() => {
      if (!this.gotEvent) this.setSource("drag");
    }, 1_500);
  }

  stop() {
    if (typeof window === "undefined") return;
    window.removeEventListener("deviceorientationabsolute", this.onAbs, true);
    window.removeEventListener("deviceorientation", this.onRel, true);
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
  }

  /** Called from pointer moves: dx/dy in CSS pixels. */
  drag(dx: number, dy: number) {
    this.lastInputAt = performance.now();
    if (this.source === "drag" || this.source === "none") {
      this.dragYaw -= dx * 0.35;
      this.dragPitch = MathUtils.clamp(this.dragPitch - dy * 0.35, -80, 80);
      this.setSource("drag");
      this.compose();
    } else {
      this.yawOffset -= dx * 0.35;
      this.compose();
    }
  }

  /** Slow auto-pan when nobody is dragging and there are no sensors. */
  tick(dtMs: number) {
    if (this.source !== "drag") return;
    const now = performance.now();
    if (now - this.lastInputAt < 4_000) { this.autoPanAt = now; return; }
    this.dragYaw += (2 * dtMs) / 1000;
    this.compose();
  }

  private handle(e: OrientationLike, absolute: boolean) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    // Android fires both; once the absolute one has spoken, ignore the relative one.
    if (absolute) this.absoluteSeen = true;
    else if (this.absoluteSeen) return;
    this.gotEvent = true;

    let alpha = e.alpha;
    if (typeof e.webkitCompassHeading === "number" && !Number.isNaN(e.webkitCompassHeading)) {
      // iOS: a real compass heading, clockwise from north. alpha runs the other way.
      alpha = 360 - e.webkitCompassHeading;
      this.heading = e.webkitCompassHeading;
      this.setSource("compass");
    } else if (absolute || e.absolute) {
      this.heading = (360 - alpha + 360) % 360;
      this.setSource("absolute");
    } else {
      this.heading = null;
      this.setSource("relative");
    }
    quatFromOrientation(this.sensorQ, alpha, e.beta, e.gamma, screenAngle());
    this.compose();
  }

  private compose() {
    if (this.source === "drag" || this.source === "none") {
      euler.set(MathUtils.degToRad(this.dragPitch), MathUtils.degToRad(this.dragYaw), 0, "YXZ");
      this.target.setFromEuler(euler);
      return;
    }
    this.yawQ.setFromAxisAngle(new Vector3(0, 1, 0), MathUtils.degToRad(this.yawOffset));
    this.target.copy(this.yawQ).multiply(this.sensorQ);
  }

  private setSource(s: HeadingSource) {
    if (this.source === s) return;
    this.source = s;
    this.onSourceChange?.(s);
  }
}

/** iOS 13+ asks for motion access from a tap; everywhere else it is just on. */
export async function requestMotionPermission(): Promise<"granted" | "denied" | "unneeded"> {
  const D = typeof DeviceOrientationEvent !== "undefined"
    ? (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> })
    : null;
  if (!D || typeof D.requestPermission !== "function") return "unneeded";
  try { return await D.requestPermission(); } catch { return "denied"; }
}
