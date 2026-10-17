import {
  ACESFilmicToneMapping, Color, DirectionalLight, FogExp2, HemisphereLight, MathUtils, PerspectiveCamera,
  Quaternion, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from "three";
import { buildBalloon, buildEnvelopeMaps, ENVELOPE_HEIGHT, type BalloonParts, type EnvelopeMaps } from "./balloon";
import type { BurnerAudio } from "./audio";

/**
 * The balloon field over the camera feed.
 *
 * Each balloon is a small physical model, not a swaying sprite: a burner that
 * heats the air, lift that follows the heat, drag, a wind that gusts and
 * changes with height, a basket that lags behind as a pendulum. They are placed
 * around the viewer and drift past; the phone's orientation only turns the
 * camera, and walking (smoothed GPS) moves the camera, so a balloon stays where
 * it is in the world as you approach it.
 *
 * The light comes from the real scene: every half second the camera frame is
 * sampled for the sky's colour and brightness, which drives the sky light,
 * the fog and how much the burner glow shows. At dusk the balloons light up.
 */

type Balloon = {
  parts: BalloonParts;
  pos: Vector3;
  vel: Vector3;
  heat: number;       // 0..1 air temperature above ambient
  burner: number;     // 0..1 flame intensity
  burnUntil: number;  // seconds (scene time) the burner stays on
  nextAutoBurn: number;
  tilt: Vector2;      // pendulum angle (x, z) in radians
  tiltVel: Vector2;
  yaw: number;
  yawVel: number;
  seed: number;
};

export type SceneOptions = {
  colorA: string;
  colorB: string;
  brand: string;
  logoUrl: string | null;
  count: number;
  audio?: BurnerAudio | null;
  onBurn?: (b: { distanceM: number }) => void;
};

const G = 9.81;
const UP = new Vector3(0, 1, 0);

export class BalloonScene {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly targetQuat = new Quaternion();
  onTick?: (dtMs: number) => void;
  fps = 0;

  private balloons: Balloon[] = [];
  private maps: EnvelopeMaps;
  private wind = new Vector3(1, 0, 0);
  private windSpeed = 3;
  private time = 0;
  private raf = 0;
  private last = 0;
  private running = false;
  private fpsAcc = 0;
  private fpsN = 0;
  private slowSince = 0;
  private hemi: HemisphereLight;
  private sun: DirectionalLight;
  private fog: FogExp2;
  private sampleCanvas: HTMLCanvasElement | null = null;
  private lastSample = 0;
  private night = 0;          // 0 day .. 1 night
  private walkTarget = new Vector3(0, 1.6, 0);
  private ray = new Raycaster();
  private ndc = new Vector2();
  private video: HTMLVideoElement | null = null;

  constructor(private canvas: HTMLCanvasElement, private opts: SceneOptions) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: dpr <= 1.5, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.camera = new PerspectiveCamera(65, 1, 0.5, 800);
    this.camera.position.set(0, 1.6, 0);

    this.hemi = new HemisphereLight(0xcfe6ff, 0xb0a090, 1.6);
    this.scene.add(this.hemi);
    this.sun = new DirectionalLight(0xfff2e0, 2.2);
    this.sun.position.set(40, 90, -30);
    this.scene.add(this.sun);
    this.fog = new FogExp2(0xdbe9f5, 0.0022);
    this.scene.fog = this.fog;

    this.maps = buildEnvelopeMaps({ colorA: opts.colorA, colorB: opts.colorB, brand: opts.brand, logo: null });
    this.loadLogo();

    const heading = Math.random() * Math.PI * 2;
    this.windSpeed = 2.2 + Math.random() * 1.6;
    this.wind.set(Math.sin(heading), 0, Math.cos(heading));
    this.spawn(MathUtils.clamp(opts.count, 3, 8));
    this.resize();
  }

  /** The camera feed, sampled for light. */
  attachVideo(v: HTMLVideoElement) { this.video = v; }

  private loadLogo() {
    if (!this.opts.logoUrl) return;
    const img = new Image();
    img.onload = () => {
      const maps = buildEnvelopeMaps({ colorA: this.opts.colorA, colorB: this.opts.colorB, brand: this.opts.brand, logo: img });
      this.maps.map.dispose(); this.maps.emissiveMap.dispose();
      this.maps = maps;
      for (const b of this.balloons) {
        b.parts.envelope.map = maps.map;
        b.parts.envelope.emissiveMap = maps.emissiveMap;
        b.parts.envelope.needsUpdate = true;
      }
    };
    img.src = this.opts.logoUrl;
  }

  private spawn(n: number) {
    for (let i = 0; i < n; i++) {
      const parts = buildBalloon(this.maps);
      const b: Balloon = {
        parts, pos: new Vector3(), vel: new Vector3(),
        heat: 0.45 + Math.random() * 0.15, burner: 0, burnUntil: 0,
        nextAutoBurn: 3 + Math.random() * 12,
        tilt: new Vector2(), tiltVel: new Vector2(),
        yaw: Math.random() * Math.PI * 2, yawVel: (Math.random() - 0.5) * 0.04,
        seed: Math.random() * 1000,
      };
      this.place(b, true);
      this.scene.add(parts.group);
      this.balloons.push(b);
    }
  }

  /** On the upwind side (or anywhere around the viewer at first), 25–65 m up. */
  private place(b: Balloon, initial: boolean) {
    const side = new Vector3(this.wind.z, 0, -this.wind.x);
    const lateral = (Math.random() * 2 - 1) * 80;
    const along = initial ? (Math.random() * 2 - 1) * 110 : -170 - Math.random() * 50;
    const p = new Vector3().addScaledVector(this.wind, along).addScaledVector(side, lateral);
    if (p.length() < 45) p.setLength(45 + Math.random() * 60);
    p.add(this.camera.position);
    b.pos.set(p.x, 22 + Math.random() * 40, p.z);
    b.vel.copy(this.wind).multiplyScalar(this.windSpeed * 0.8);
    b.heat = 0.45 + Math.random() * 0.15;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // A phone's main camera is about 65° tall in portrait, 45° in landscape.
    this.camera.fov = h >= w ? 65 : 45;
    this.camera.updateProjectionMatrix();
  }

  /** Where the viewer has walked, in metres east/north from where they started. */
  setViewerOffset(east: number, north: number) {
    // GPS jitters by several metres; only a real walk moves the camera, and
    // then the camera glides there over a few seconds.
    const t = new Vector3(east, 1.6, -north);
    if (t.distanceTo(this.walkTarget) > 6) this.walkTarget.copy(t);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = now - this.last;
      if (dt < 33) return;
      this.last = now;
      const s = Math.min(dt, 100) / 1000;
      this.time += s;
      this.step(s);
      this.onTick?.(dt);
      this.sampleLight(now);
      this.renderNow();
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc >= 1000) {
        this.fps = Math.round((this.fpsN * 1000) / this.fpsAcc);
        this.fpsAcc = 0; this.fpsN = 0;
        this.degradeIfSlow(now);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  // ---- the wind: a base flow, gusts, and a change with height (shear) ----
  private windAt(y: number, out: Vector3): Vector3 {
    const t = this.time;
    const gust = 1 + 0.25 * Math.sin(t * 0.21) + 0.15 * Math.sin(t * 0.57 + 1.3) + 0.08 * Math.sin(t * 1.31 + 2.1);
    const speed = this.windSpeed * gust * (0.75 + Math.min(y, 120) / 160);
    const turn = MathUtils.degToRad((y - 40) * 0.25) + 0.12 * Math.sin(t * 0.13);
    out.set(
      this.wind.x * Math.cos(turn) - this.wind.z * Math.sin(turn), 0,
      this.wind.x * Math.sin(turn) + this.wind.z * Math.cos(turn),
    ).multiplyScalar(speed);
    return out;
  }

  private tmpWind = new Vector3();
  private tmpAcc = new Vector3();

  private step(dt: number) {
    this.camera.quaternion.slerp(this.targetQuat, 0.25);
    this.camera.position.lerp(this.walkTarget, Math.min(1, dt / 3));
    const cam = this.camera.position;

    for (const b of this.balloons) {
      // Burner: taps and the pilot's own bursts, when the air cools.
      if (this.time >= b.nextAutoBurn && b.burnUntil < this.time) {
        const dur = 1.2 + Math.random() * 1.6;
        this.fire(b, dur, false);
        b.nextAutoBurn = this.time + dur + 7 + Math.random() * 14;
      }
      // Stay in the band the viewer can see: too low burns, too high waits.
      if (b.pos.y < 18 && b.burnUntil < this.time) { this.fire(b, 1.5, false); b.nextAutoBurn = this.time + 10; }
      if (b.pos.y > 75) { b.burnUntil = 0; b.nextAutoBurn = Math.max(b.nextAutoBurn, this.time + 12); }

      const burning = b.burnUntil > this.time;
      b.burner = MathUtils.damp(b.burner, burning ? 1 : 0, burning ? 9 : 5, dt);
      // Heat: fast to gain, slow to lose.
      b.heat += ((b.burner * 0.42) - 0.11 * (b.heat - 0.3)) * dt;
      b.heat = MathUtils.clamp(b.heat, 0, 1);

      // Lift against weight, plus vertical drag.
      const lift = (b.heat - 0.5) * 1.1;
      const ay = lift - 0.55 * b.vel.y;
      // Horizontal: catching up to the wind over several seconds.
      this.windAt(b.pos.y, this.tmpWind);
      const ax = (this.tmpWind.x - b.vel.x) / 7;
      const az = (this.tmpWind.z - b.vel.z) / 7;
      this.tmpAcc.set(ax, ay, az);
      b.vel.addScaledVector(this.tmpAcc, dt);
      b.pos.addScaledVector(b.vel, dt);

      // The basket as a pendulum under the envelope: horizontal acceleration
      // swings it, gravity brings it back, air damps it.
      const L = 7;
      const tx = b.tilt.x, tz = b.tilt.y;
      b.tiltVel.x += (-(G / L) * Math.sin(tx) - 0.9 * b.tiltVel.x - az / L) * dt;
      b.tiltVel.y += (-(G / L) * Math.sin(tz) - 0.9 * b.tiltVel.y + ax / L) * dt;
      b.tilt.x += b.tiltVel.x * dt;
      b.tilt.y += b.tiltVel.y * dt;
      // Fabric flutter: a few tenths of a degree, faster when the burner is on.
      const flutter = 0.004 * (1 + 2 * b.burner) * Math.sin(this.time * 6.1 + b.seed);

      b.yawVel += (Math.random() - 0.5) * 0.004 * dt;
      b.yawVel = MathUtils.clamp(b.yawVel * (1 - 0.05 * dt), -0.08, 0.08);
      b.yaw += b.yawVel * dt;

      const g = b.parts.group;
      g.position.copy(b.pos);
      g.rotation.set(MathUtils.clamp(b.tilt.x, -0.25, 0.25) + flutter, b.yaw, MathUtils.clamp(b.tilt.y, -0.25, 0.25));

      // The flame and the glow.
      const f = b.burner;
      b.parts.flame.scale.set(0.7 + 0.5 * f, Math.max(0.01, f * (0.8 + 0.25 * Math.sin(this.time * 23 + b.seed))), 0.7 + 0.5 * f);
      b.parts.flameMat.opacity = f * 0.9;
      b.parts.light.intensity = f * (160 + 60 * Math.sin(this.time * 19 + b.seed)) * (0.6 + 0.4 * this.night);
      // Ambient heat keeps a faint glow; the burner floods it; night shows all of it.
      b.parts.envelope.emissiveIntensity = (0.08 * b.heat + 1.6 * f) * (0.35 + 0.65 * this.night);

      // Gone downwind, or drifted too far: back round upwind.
      const rel = b.pos.clone().sub(cam);
      if (rel.dot(this.wind) > 190 || rel.length() > 260 || rel.length() < 20) this.place(b, false);
    }
  }

  private fire(b: Balloon, seconds: number, byTap: boolean) {
    b.burnUntil = this.time + seconds;
    const d = b.pos.distanceTo(this.camera.position);
    this.opts.audio?.burst(seconds, d);
    if (byTap) this.opts.onBurn?.({ distanceM: d });
  }

  /** A tap at CSS-pixel (x, y): fires the burner of the balloon under it. */
  tap(x: number, y: number): boolean {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
    this.ray.setFromCamera(this.ndc, this.camera);
    // Forgiving: a tap within a balloon's radius of its centre line counts.
    let best: Balloon | null = null, bestD = Infinity;
    for (const b of this.balloons) {
      const centre = b.pos.clone(); centre.y += ENVELOPE_HEIGHT * 0.6 + 6;
      const d = this.ray.ray.distanceToPoint(centre);
      const dist = centre.distanceTo(this.camera.position);
      if (d < 11 + dist * 0.04 && dist < bestD) { best = b; bestD = dist; }
    }
    if (!best) return false;
    this.fire(best, 2.2, true);
    best.nextAutoBurn = this.time + 12 + Math.random() * 10;
    return true;
  }

  // ---- light from the camera frame ----
  private sampleLight(now: number) {
    const v = this.video;
    if (!v || v.readyState < 2 || now - this.lastSample < 500) return;
    this.lastSample = now;
    try {
      if (!this.sampleCanvas) { this.sampleCanvas = document.createElement("canvas"); this.sampleCanvas.width = 16; this.sampleCanvas.height = 9; }
      const ctx = this.sampleCanvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(v, 0, 0, 16, 9);
      const px = ctx.getImageData(0, 0, 16, 9).data;
      let r = 0, g = 0, bl = 0, n = 0, lumAll = 0, bright = -1, bi = 0;
      for (let i = 0; i < 16 * 9; i++) {
        const R = px[i * 4], Gc = px[i * 4 + 1], B = px[i * 4 + 2];
        const lum = (0.2126 * R + 0.7152 * Gc + 0.0722 * B) / 255;
        lumAll += lum;
        if (i < 16 * 3) { r += R; g += Gc; bl += B; n++; }
        if (lum > bright) { bright = lum; bi = i; }
      }
      lumAll /= 16 * 9;
      const sky = new Color(r / n / 255, g / n / 255, bl / n / 255);
      // Keep a little hue, never fully black: the sky light and fog follow the real sky.
      const skyLight = sky.clone().lerp(new Color(0xcfe6ff), 0.35).multiplyScalar(0.6 + 0.6 * lumAll);
      this.hemi.color.lerp(skyLight, 0.3);
      this.hemi.groundColor.lerp(sky.clone().multiplyScalar(0.5).lerp(new Color(0x8a7a66), 0.5), 0.3);
      this.hemi.intensity = MathUtils.lerp(this.hemi.intensity, 0.4 + 1.6 * lumAll, 0.3);
      this.fog.color.lerp(sky.clone().lerp(new Color(0xffffff), 0.15), 0.3);
      this.sun.intensity = MathUtils.lerp(this.sun.intensity, 0.3 + 2.4 * Math.max(0, lumAll - 0.15), 0.3);
      const night = MathUtils.clamp(1 - (lumAll - 0.12) / 0.3, 0, 1);
      this.night = MathUtils.lerp(this.night, night, 0.3);
      // The brightest patch of the frame is where the light comes from.
      if (bright > 0.75) {
        const sx = ((bi % 16) + 0.5) / 16 * 2 - 1, sy = -((Math.floor(bi / 16) + 0.5) / 9 * 2 - 1);
        const dir = new Vector3(sx, sy, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
        if (dir.dot(UP) > 0.1) this.sun.position.lerp(dir.multiplyScalar(100), 0.2);
      }
    } catch { /* a tainted or paused frame: keep the last light */ }
  }

  private degradeIfSlow(now: number) {
    if (this.fps >= 20) { this.slowSince = 0; return; }
    if (!this.slowSince) { this.slowSince = now; return; }
    if (now - this.slowSince < 5000) return;
    this.slowSince = 0;
    if (this.renderer.getPixelRatio() > 1) { this.renderer.setPixelRatio(1); this.resize(); return; }
    const target = Math.max(3, this.balloons.length - 2);
    while (this.balloons.length > target) {
      const b = this.balloons.pop()!;
      this.scene.remove(b.parts.group);
    }
  }

  get balloonCount() { return this.balloons.length; }
  get isNight() { return this.night > 0.5; }

  renderNow() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    this.stop();
    for (const b of this.balloons) { b.parts.envelope.dispose(); b.parts.flameMat.dispose(); }
    this.maps.map.dispose(); this.maps.emissiveMap.dispose();
    this.renderer.dispose();
  }
}
