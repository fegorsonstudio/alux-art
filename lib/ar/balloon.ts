import {
  BoxGeometry, BufferGeometry, CanvasTexture, CylinderGeometry, Float32BufferAttribute, Group,
  LatheGeometry, LineBasicMaterial, LineSegments, Mesh, MeshLambertMaterial, SRGBColorSpace, Vector2,
} from "three";

/**
 * One branded hot-air balloon, built from scratch: a lathe envelope, a
 * burner, a wicker basket and four ropes. No model files, so nothing to
 * download and nothing the CSP has to allow. The envelope's texture is drawn
 * on a canvas: gores in the two brand colours and the logo on two opposite
 * panels.
 */

export const ENVELOPE_HEIGHT = 18;
export const ENVELOPE_RADIUS = 9;

/** The gores, seams and two logo panels. 1024×512: u wraps around, v runs top to bottom. */
export function buildBalloonTexture(opts: { colorA: string; colorB: string; logo?: HTMLImageElement | null; brand: string }): CanvasTexture {
  const W = 1024, H = 512;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;

  const gores = 16, gw = W / gores;
  for (let i = 0; i < gores; i++) {
    ctx.fillStyle = i % 2 === 0 ? opts.colorA : opts.colorB;
    ctx.fillRect(Math.floor(i * gw), 0, Math.ceil(gw) + 1, H);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(Math.floor(i * gw), 0, 2, H);
  }
  // A soft darkening toward the throat so the bottom reads as shaded.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(255,255,255,0.10)");
  g.addColorStop(0.55, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Two logo panels on opposite sides, on the fat shoulder of the envelope
  // (v 0.30–0.62), where the lathe's UVs stretch least.
  const panel = 190, pad = 16;
  for (const u of [0.25, 0.75]) {
    const x = u * W - panel / 2, y = 0.30 * H + ((0.32 * H) - panel) / 2;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x, y, panel, panel, 22);
    ctx.fill();
    if (opts.logo && opts.logo.naturalWidth > 0) {
      const iw = opts.logo.naturalWidth, ih = opts.logo.naturalHeight;
      const s = Math.min((panel - 2 * pad) / iw, (panel - 2 * pad) / ih);
      const dw = iw * s, dh = ih * s;
      ctx.drawImage(opts.logo, x + (panel - dw) / 2, y + (panel - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = "#263235";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let size = 44;
      ctx.font = `800 ${size}px Outfit, system-ui, sans-serif`;
      while (ctx.measureText(opts.brand).width > panel - 2 * pad && size > 14) {
        size -= 2;
        ctx.font = `800 ${size}px Outfit, system-ui, sans-serif`;
      }
      ctx.fillText(opts.brand, x + panel / 2, y + panel / 2);
    }
  }

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Radius against height (0 = throat, 1 = crown), the classic bulb. */
const PROFILE: [number, number][] = [
  [0.18, 0.00], [0.30, 0.04], [0.50, 0.10], [0.70, 0.18], [0.86, 0.28],
  [0.96, 0.40], [1.00, 0.52], [0.98, 0.64], [0.92, 0.75], [0.80, 0.85],
  [0.62, 0.93], [0.40, 0.98], [0.18, 1.00], [0.00, 1.00],
];

let envelopeGeo: LatheGeometry | null = null;
let burnerGeo: CylinderGeometry | null = null;
let basketGeo: BoxGeometry | null = null;
let ropeGeo: BufferGeometry | null = null;

function geometries() {
  if (!envelopeGeo) {
    const pts = PROFILE.map(([r, h]) => new Vector2(r * ENVELOPE_RADIUS, h * ENVELOPE_HEIGHT));
    envelopeGeo = new LatheGeometry(pts, 28);
    // Lathe UVs run v from the first point (throat) up; flip so the top of the
    // canvas is the crown, matching how the texture was drawn.
    const uv = envelopeGeo.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    uv.needsUpdate = true;
    burnerGeo = new CylinderGeometry(0.9, 1.1, 1.2, 8, 1, true);
    basketGeo = new BoxGeometry(1.2, 1.0, 1.2);
    const b = 0.6, t = ENVELOPE_RADIUS * 0.18, y0 = -5.2, y1 = -0.2;
    const ropes: number[] = [];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ropes.push(sx * b, y0, sz * b, sx * t * 0.8, y1, sz * t * 0.8);
    ropeGeo = new BufferGeometry();
    ropeGeo.setAttribute("position", new Float32BufferAttribute(ropes, 3));
  }
  return { envelopeGeo: envelopeGeo!, burnerGeo: burnerGeo!, basketGeo: basketGeo!, ropeGeo: ropeGeo! };
}

const burnerMat = new MeshLambertMaterial({ color: 0x3a3a3a });
const basketMat = new MeshLambertMaterial({ color: 0x8a5a2b });
const ropeMat = new LineBasicMaterial({ color: 0x5a4a3a });

/** The whole balloon, origin at the basket's centre; the envelope's base sits at y = 0. */
export function buildBalloon(material: MeshLambertMaterial): Group {
  const { envelopeGeo, burnerGeo, basketGeo, ropeGeo } = geometries();
  const g = new Group();
  const env = new Mesh(envelopeGeo, material);
  env.position.y = 0;
  g.add(env);
  const burner = new Mesh(burnerGeo, burnerMat);
  burner.position.y = -0.8;
  g.add(burner);
  const basket = new Mesh(basketGeo, basketMat);
  basket.position.y = -5.7;
  g.add(basket);
  g.add(new LineSegments(ropeGeo, ropeMat));
  return g;
}
