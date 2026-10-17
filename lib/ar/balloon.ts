import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry,
  DoubleSide, Float32BufferAttribute, Group, LatheGeometry, LineBasicMaterial, LineSegments, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PointLight, SRGBColorSpace, TorusGeometry, Vector2,
} from "three";

/**
 * One branded hot-air balloon, built from scratch, proportioned like the real
 * thing: a 20 m envelope on 16 gores with load tapes and a dark Nomex skirt,
 * a parachute vent at the crown, a burner frame on four uprights, a wicker
 * basket, and a flame. The envelope is a fabric lit from inside: a point
 * light at the burner lights the interior when you look up through the
 * throat, and an emissive copy of the gore pattern, strongest near the
 * throat, makes the outside glow when the burner fires.
 */

export const ENVELOPE_HEIGHT = 20;
export const ENVELOPE_RADIUS = 9.2;
/** Throat of the envelope sits this far above the basket's origin. */
export const THROAT_Y = 6.2;

const W = 1024, H = 1024;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function shade(hex: string, k: number): string {
  const c = new Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

/** The gore pattern: colour, logo panels, tapes, skirt, crown. u wraps around; v = 0 is the crown. */
function drawEnvelope(ctx: CanvasRenderingContext2D, colorA: string, colorB: string, logo: HTMLImageElement | null, brand: string) {
  const gores = 16, gw = W / gores;
  for (let i = 0; i < gores; i++) {
    const c = i % 2 === 0 ? colorA : colorB;
    // Each gore is slightly lighter at its centre and darker at its edges, the
    // way a curved panel catches light.
    const g = ctx.createLinearGradient(i * gw, 0, (i + 1) * gw, 0);
    g.addColorStop(0, shade(c, 0.78)); g.addColorStop(0.5, shade(c, 1.06)); g.addColorStop(1, shade(c, 0.78));
    ctx.fillStyle = g;
    ctx.fillRect(Math.floor(i * gw), 0, Math.ceil(gw) + 1, H);
  }
  // Horizontal panel seams and a brighter band at the equator.
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  for (const v of [0.22, 0.40, 0.58, 0.76]) ctx.fillRect(0, v * H, W, 2);
  // Load tapes.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  for (let i = 0; i < gores; i++) ctx.fillRect(Math.floor(i * gw), 0, 3, H);
  // Skirt: dark fire-resistant fabric around the throat.
  const skirt = ctx.createLinearGradient(0, 0.86 * H, 0, H);
  skirt.addColorStop(0, "rgba(28,24,22,0)"); skirt.addColorStop(0.25, "rgba(28,24,22,0.92)"); skirt.addColorStop(1, "rgba(18,16,15,1)");
  ctx.fillStyle = skirt;
  ctx.fillRect(0, 0.86 * H, W, 0.14 * H);
  // Crown: the parachute vent disc and its ring.
  ctx.fillStyle = "rgba(20,20,22,0.9)";
  ctx.fillRect(0, 0, W, 0.045 * H);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(0, 0.045 * H, W, 3);

  // Two logo panels on opposite sides at the equator, where the lathe's UVs stretch least.
  const panel = 230, pad = 18;
  for (const u of [0.25, 0.75]) {
    const x = u * W - panel / 2, y = 0.36 * H;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x, y, panel, panel, 26);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    roundRect(ctx, x, y + panel - 10, panel, 10, 5);
    ctx.fill();
    if (logo && logo.naturalWidth > 0) {
      const iw = logo.naturalWidth, ih = logo.naturalHeight;
      const s = Math.min((panel - 2 * pad) / iw, (panel - 2 * pad) / ih);
      ctx.drawImage(logo, x + (panel - iw * s) / 2, y + (panel - ih * s) / 2, iw * s, ih * s);
    } else {
      ctx.fillStyle = "#263235";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      let size = 52;
      ctx.font = `800 ${size}px Outfit, system-ui, sans-serif`;
      while (ctx.measureText(brand).width > panel - 2 * pad && size > 14) { size -= 2; ctx.font = `800 ${size}px Outfit, system-ui, sans-serif`; }
      ctx.fillText(brand, x + panel / 2, y + panel / 2);
    }
  }
}

export type EnvelopeMaps = { map: CanvasTexture; emissiveMap: CanvasTexture };

/** The colour texture, and an emissive copy that fades out toward the crown. */
export function buildEnvelopeMaps(opts: { colorA: string; colorB: string; logo?: HTMLImageElement | null; brand: string }): EnvelopeMaps {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  drawEnvelope(ctx, opts.colorA, opts.colorB, opts.logo ?? null, opts.brand);
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;

  // The glow: the same fabric, lit from the burner below, so bright at the
  // throat and gone by the shoulder. The skirt is opaque and does not glow.
  const e = document.createElement("canvas");
  e.width = W; e.height = H;
  const ectx = e.getContext("2d")!;
  ectx.drawImage(c, 0, 0);
  ectx.globalCompositeOperation = "multiply";
  const g = ectx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#000000"); g.addColorStop(0.30, "#1a1008"); g.addColorStop(0.62, "#8a5a28");
  g.addColorStop(0.84, "#ffb060"); g.addColorStop(0.87, "#2a1a10"); g.addColorStop(1, "#000000");
  ectx.fillStyle = g;
  ectx.fillRect(0, 0, W, H);
  const emissiveMap = new CanvasTexture(e);
  emissiveMap.colorSpace = SRGBColorSpace;
  return { map, emissiveMap };
}

/** Radius against height (0 = throat, 1 = crown): a modern 16-gore envelope. */
const PROFILE: [number, number][] = [
  [0.17, 0.000], [0.26, 0.030], [0.42, 0.085], [0.60, 0.160], [0.76, 0.250],
  [0.89, 0.350], [0.97, 0.460], [1.00, 0.570], [0.98, 0.670], [0.92, 0.760],
  [0.82, 0.840], [0.66, 0.910], [0.46, 0.962], [0.24, 0.990], [0.06, 1.000],
];

let geos: {
  envelope: LatheGeometry; crown: TorusGeometry; burner: CylinderGeometry; upright: CylinderGeometry;
  basket: BoxGeometry; rim: TorusGeometry; ropes: BufferGeometry; flame: ConeGeometry;
} | null = null;

function geometries() {
  if (geos) return geos;
  const pts = PROFILE.map(([r, h]) => new Vector2(r * ENVELOPE_RADIUS, h * ENVELOPE_HEIGHT));
  const envelope = new LatheGeometry(pts, 32);
  // Lathe v runs throat→crown; the texture was drawn crown→throat.
  const uv = envelope.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  uv.needsUpdate = true;

  const ropes: number[] = [];
  const t = PROFILE[0][0] * ENVELOPE_RADIUS;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    ropes.push(sx * 0.55, 0.55, sz * 0.55, sx * t * 0.95, THROAT_Y, sz * t * 0.95);
  }
  const ropeGeo = new BufferGeometry();
  ropeGeo.setAttribute("position", new Float32BufferAttribute(ropes, 3));

  geos = {
    envelope,
    crown: new TorusGeometry(0.9, 0.08, 6, 24),
    burner: new CylinderGeometry(0.42, 0.5, 0.55, 10),
    upright: new CylinderGeometry(0.04, 0.04, 2.2, 6),
    basket: new BoxGeometry(1.25, 1.1, 1.25),
    rim: new TorusGeometry(0.85, 0.05, 6, 4),
    ropes: ropeGeo,
    flame: new ConeGeometry(0.42, 2.6, 10, 1, true),
  };
  return geos;
}

const steelMat = new MeshStandardMaterial({ color: 0x4a4a4e, metalness: 0.7, roughness: 0.45 });
const wickerMat = new MeshStandardMaterial({ color: 0x7a4f26, roughness: 0.95 });
const leatherMat = new MeshStandardMaterial({ color: 0x3b2516, roughness: 0.8 });
const ropeMat = new LineBasicMaterial({ color: 0x5a4a3a });

export type BalloonParts = {
  group: Group;
  envelope: MeshStandardMaterial;
  flame: Mesh;
  flameMat: MeshBasicMaterial;
  light: PointLight;
};

/** The whole balloon, origin at the basket floor; the envelope throat is at THROAT_Y. */
export function buildBalloon(maps: EnvelopeMaps): BalloonParts {
  const g = geometries();
  const group = new Group();

  const envelope = new MeshStandardMaterial({
    map: maps.map,
    emissiveMap: maps.emissiveMap,
    emissive: new Color(0xffa24a),
    emissiveIntensity: 0,
    roughness: 0.62,
    metalness: 0,
    side: DoubleSide,
  });
  const env = new Mesh(g.envelope, envelope);
  env.position.y = THROAT_Y;
  group.add(env);

  const crown = new Mesh(g.crown, steelMat);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = THROAT_Y + ENVELOPE_HEIGHT - 0.05;
  group.add(crown);

  // Burner frame: four uprights from the basket rim to the burner.
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const up = new Mesh(g.upright, steelMat);
    up.position.set(sx * 0.52, 1.1 + 1.1, sz * 0.52);
    group.add(up);
  }
  const burner = new Mesh(g.burner, steelMat);
  burner.position.y = 3.35;
  group.add(burner);

  const basket = new Mesh(g.basket, wickerMat);
  basket.position.y = 0.55;
  group.add(basket);
  const rim = new Mesh(g.rim, leatherMat);
  rim.rotation.x = Math.PI / 2;
  rim.rotation.z = Math.PI / 4;
  rim.position.y = 1.12;
  group.add(rim);

  group.add(new LineSegments(g.ropes, ropeMat));

  const flameMat = new MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
  const flame = new Mesh(g.flame, flameMat);
  flame.position.y = 3.6 + 1.3;
  flame.scale.set(1, 0.01, 1);
  group.add(flame);

  const light = new PointLight(0xffa040, 0, 60, 2);
  light.position.y = THROAT_Y + 3.5;
  group.add(light);

  return { group, envelope, flame, flameMat, light };
}
