import {
  DirectionalLight, FogExp2, HemisphereLight, MathUtils, MeshLambertMaterial, PerspectiveCamera, Quaternion,
  Scene, SRGBColorSpace, Vector3, WebGLRenderer, type Group,
} from "three";
import { buildBalloon, buildBalloonTexture, ENVELOPE_HEIGHT } from "./balloon";

/**
 * The balloon field over the camera feed.
 *
 * Nothing is tied to GPS coordinates. The balloons live in a world frame
 * around the viewer: a shared wind carries them past, each with its own bob
 * and sway, and they respawn upwind once they have drifted far enough
 * downwind. The phone's orientation only turns the camera, so a wobbly GPS
 * fix never moves a balloon.
 */

type Balloon = { group: Group; speed: number; bobAmp: number; bobPeriod: number; swayPeriod: number; phase: number; baseY: number };

export type SceneOptions = {
  colorA: string;
  colorB: string;
  brand: string;
  logoUrl: string | null;
  count: number;
};

export class BalloonScene {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private balloons: Balloon[] = [];
  private materials: MeshLambertMaterial[] = [];
  private wind = new Vector3();
  private windSpeed = 3;
  private raf = 0;
  private last = 0;
  private running = false;
  private fpsAcc = 0;
  private fpsN = 0;
  private slowSince = 0;
  fps = 0;
  /** Set each frame from the orientation source. */
  readonly targetQuat = new Quaternion();
  onTick?: (dtMs: number) => void;

  constructor(private canvas: HTMLCanvasElement, private opts: SceneOptions) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: dpr <= 1.5, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;

    this.camera = new PerspectiveCamera(65, 1, 0.5, 600);
    this.camera.position.set(0, 1.6, 0);

    this.scene.add(new HemisphereLight(0xdff1ff, 0xffe2cc, 1.1));
    const sun = new DirectionalLight(0xffffff, 0.9);
    sun.position.set(30, 80, -40);
    this.scene.add(sun);
    this.scene.fog = new FogExp2(0xe8f3ff, 0.0035);

    const a = buildBalloonTexture({ colorA: opts.colorA, colorB: opts.colorB, brand: opts.brand, logo: null });
    const b = buildBalloonTexture({ colorA: opts.colorB, colorB: opts.colorA, brand: opts.brand, logo: null });
    this.materials = [new MeshLambertMaterial({ map: a }), new MeshLambertMaterial({ map: b })];
    this.loadLogo();

    const heading = Math.random() * Math.PI * 2;
    this.windSpeed = 2.5 + Math.random() * 1.5;
    this.wind.set(Math.sin(heading), 0, Math.cos(heading));
    this.spawn(MathUtils.clamp(opts.count, 3, 8));
    this.resize();
  }

  private loadLogo() {
    if (!this.opts.logoUrl) return;
    const img = new Image();
    // Same origin (/api/media), so no crossOrigin attribute is needed and the
    // canvas never taints. A logo that fails leaves the brand-name panels.
    img.onload = () => {
      const a = buildBalloonTexture({ colorA: this.opts.colorA, colorB: this.opts.colorB, brand: this.opts.brand, logo: img });
      const b = buildBalloonTexture({ colorA: this.opts.colorB, colorB: this.opts.colorA, brand: this.opts.brand, logo: img });
      this.materials[0].map?.dispose(); this.materials[1].map?.dispose();
      this.materials[0].map = a; this.materials[1].map = b;
      this.materials[0].needsUpdate = true; this.materials[1].needsUpdate = true;
    };
    img.src = this.opts.logoUrl;
  }

  private spawn(n: number) {
    for (let i = 0; i < n; i++) {
      const group = buildBalloon(this.materials[i % 2]);
      const b: Balloon = {
        group, speed: 0.85 + Math.random() * 0.3,
        bobAmp: 0.6 + Math.random() * 0.6, bobPeriod: 6 + Math.random() * 3,
        swayPeriod: 7 + Math.random() * 4, phase: Math.random() * Math.PI * 2,
        baseY: 15 + Math.random() * 30,
      };
      this.place(b, true);
      this.scene.add(group);
      this.balloons.push(b);
    }
  }

  /** Somewhere on the upwind side (or anywhere on the ring at first). */
  private place(b: Balloon, initial: boolean) {
    const side = new Vector3(this.wind.z, 0, -this.wind.x);
    const lateral = (Math.random() * 2 - 1) * 70;
    const along = initial ? (Math.random() * 2 - 1) * 120 : -150 - Math.random() * 40;
    const p = new Vector3().addScaledVector(this.wind, along).addScaledVector(side, lateral);
    if (p.length() < 40) p.setLength(40 + Math.random() * 80);
    b.baseY = 15 + Math.random() * 30;
    b.group.position.set(p.x, b.baseY, p.z);
    b.group.rotation.y = Math.random() * Math.PI * 2;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = h >= w ? 65 : 45;
    this.camera.updateProjectionMatrix();
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
      this.step(Math.min(dt, 100) / 1000, now / 1000);
      this.onTick?.(dt);
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

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private step(dt: number, t: number) {
    this.camera.quaternion.slerp(this.targetQuat, 0.25);
    const camPos = this.camera.position;
    for (const b of this.balloons) {
      const g = b.group;
      g.position.addScaledVector(this.wind, this.windSpeed * b.speed * dt);
      g.position.y = b.baseY + Math.sin((t / b.bobPeriod) * Math.PI * 2 + b.phase) * b.bobAmp;
      g.rotation.x = Math.sin((t / b.swayPeriod) * Math.PI * 2 + b.phase) * 0.044;
      g.rotation.z = Math.cos((t / (b.swayPeriod * 1.3)) * Math.PI * 2 + b.phase) * 0.044;
      const rel = g.position.clone().sub(camPos);
      const along = rel.dot(this.wind);
      const dist = rel.length();
      if (along > 150 || dist < 25) this.place(b, false);
      // Far balloons never shrink past about five degrees of sky.
      const apparent = ENVELOPE_HEIGHT / dist;
      const min = Math.tan(MathUtils.degToRad(5));
      g.scale.setScalar(apparent < min ? min / apparent : 1);
    }
  }

  private degradeIfSlow(now: number) {
    if (this.fps >= 20) { this.slowSince = 0; return; }
    if (!this.slowSince) { this.slowSince = now; return; }
    if (now - this.slowSince < 5000) return;
    this.slowSince = 0;
    if (this.renderer.getPixelRatio() > 1) { this.renderer.setPixelRatio(1); this.resize(); return; }
    // Then two balloons fewer, never below three.
    const target = Math.max(3, this.balloons.length - 2);
    while (this.balloons.length > target) {
      const b = this.balloons.pop()!;
      this.scene.remove(b.group);
    }
  }

  get balloonCount() { return this.balloons.length; }

  /** One frame now; the photo button draws the canvas right after this. */
  renderNow() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stop();
    for (const m of this.materials) { m.map?.dispose(); m.dispose(); }
    this.renderer.dispose();
  }
}
