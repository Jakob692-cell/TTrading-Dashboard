import * as THREE from 'three';
import type { DeviceFinish, FlavorId } from '../models';

/**
 * NoVape One geometry, in millimetres (the device is 100 mm tall, y is up,
 * the front with button and light strip faces +z). Ported from the hardware
 * plan in novape/hardware so the app shows the same object that gets built.
 */

type ShapeClass = typeof THREE.Shape | typeof THREE.Path;

function rrShape(w: number, d: number, r: number, Cls: ShapeClass = THREE.Shape) {
  const s = new Cls();
  const x = -w / 2;
  const y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + d - r);
  s.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + d);
  s.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI, false);
  return s;
}

interface PrismOptions {
  bevel?: number;
  wall?: number;
  hole?: [number, number, number];
}

/** Vertical prism with a rounded-rectangle footprint (w along x, d along z), bottom at y = 0. */
function prism(w: number, d: number, r: number, h: number, opt: PrismOptions = {}) {
  const b = opt.bevel ?? 0;
  const shape = rrShape(w - 2 * b, d - 2 * b, Math.max(0.2, r - b)) as THREE.Shape;
  if (opt.wall) shape.holes.push(rrShape(w - 2 * opt.wall, d - 2 * opt.wall, Math.max(0.2, r - opt.wall), THREE.Path));
  if (opt.hole) shape.holes.push(rrShape(opt.hole[0], opt.hole[1], opt.hole[2], THREE.Path));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, h - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 8,
    curveSegments: 32,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, b, 0);
  geo.computeVertexNormals();
  return geo;
}

/** Points around a stadium (w along x, d along z), evenly spaced by arc length. */
function stadiumPts(w: number, d: number, n: number): Array<[number, number]> {
  const r = Math.min(w, d) / 2;
  const L = Math.max(0, w - d);
  const P = 2 * L + 2 * Math.PI * r;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    let s = (i / n) * P;
    const q = (Math.PI * r) / 2;
    if (s < q) {
      const a = s / r;
      out.push([L / 2 + r * Math.cos(a), r * Math.sin(a)]);
      continue;
    }
    s -= q;
    if (s < L) {
      out.push([L / 2 - s, r]);
      continue;
    }
    s -= L;
    if (s < Math.PI * r) {
      const a = Math.PI / 2 + s / r;
      out.push([-L / 2 + r * Math.cos(a), r * Math.sin(a)]);
      continue;
    }
    s -= Math.PI * r;
    if (s < L) {
      out.push([-L / 2 + s, -r]);
      continue;
    }
    s -= L;
    const a = 1.5 * Math.PI + s / r;
    out.push([L / 2 + r * Math.cos(a), r * Math.sin(a)]);
  }
  return out;
}

interface Section {
  y: number;
  w: number;
  d: number;
}

/** Skin through stadium cross-sections, optionally closed at the top. */
function loft(sections: Section[], n: number, topY?: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  sections.forEach((sec) => stadiumPts(sec.w, sec.d, n).forEach((p) => pos.push(p[0], sec.y, p[1])));
  for (let k = 0; k < sections.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const b = k * n + ((i + 1) % n);
      const c = (k + 1) * n + i;
      const d = (k + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  if (topY != null) {
    const base = (sections.length - 1) * n;
    const ci = pos.length / 3;
    pos.push(0, topY, 0);
    for (let i = 0; i < n; i++) idx.push(base + i, ci, base + ((i + 1) % n));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function disc(r: number, h: number, seg = 40) {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  g.translate(0, h / 2, 0);
  return g;
}

/** Cap-like dome: tapering stadium walls with a rounded top. */
function domeSections(w0: number, d0: number, y0: number, yTop: number, rTop: number, inset0: number): Section[] {
  const secs: Section[] = [
    { y: y0, w: w0, d: d0 },
    { y: y0 + (yTop - rTop - y0) * 0.5, w: w0 - inset0 / 2, d: d0 - inset0 * 0.3 },
    { y: yTop - rTop, w: w0 - inset0, d: d0 - inset0 * 0.6 },
  ];
  const wT = w0 - inset0;
  const dT = d0 - inset0 * 0.6;
  for (let k = 1; k <= 14; k++) {
    const phi = (k / 14) * (Math.PI / 2);
    const inset = rTop * (1 - Math.cos(phi));
    secs.push({ y: yTop - rTop + rTop * Math.sin(phi), w: wT - 2 * inset, d: Math.max(1.2, dT - 1.75 * inset) });
  }
  return secs;
}

/* ------------------------------- Materials ------------------------------- */

export const FINISH_LOOK: Record<DeviceFinish, { color: string; metalness: number; roughness: number; mark: string }> = {
  champagne: { color: '#cbbba6', metalness: 0.72, roughness: 0.4, mark: '#4d463d' },
  black: { color: '#202023', metalness: 0.55, roughness: 0.42, mark: '#c4c4c8' },
  graphite: { color: '#8b8c91', metalness: 0.85, roughness: 0.34, mark: '#2b2b2d' },
  sage: { color: '#627f69', metalness: 0.62, roughness: 0.4, mark: '#e4ece5' },
};

/** Saturated flavour colours for the cartridge core (the app's accents are pastel UI tints). */
export const FLAVOR_CORE: Record<FlavorId, string> = {
  mint: '#16a05a',
  lemon: '#f5b700',
  berry: '#d8203f',
};

/**
 * Smoked glass: multiplies what is behind it and darkens towards the
 * silhouette, like tinted plastic. Needs an opaque background.
 */
function tintedGlass(r: number, g: number, b: number, edge = 1, power = 1.1) {
  return new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(r, g, b) }, edge: { value: edge }, power: { value: power } },
    vertexShader: [
      'varying vec3 vN; varying vec3 vV;',
      'void main() {',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  vV = -mv.xyz; vN = normalize(normalMatrix * normal);',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 tint; uniform float edge; uniform float power; varying vec3 vN; varying vec3 vV;',
      'void main() {',
      '  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), power);',
      '  gl_FragColor = vec4(mix(tint, vec3(0.015), f * edge), 1.0);',
      '}',
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    blending: THREE.MultiplyBlending,
    side: THREE.DoubleSide,
  });
}

/** Additive reflection layer on top of the tinted glass. */
function glassGloss(intensity = 1.5) {
  return new THREE.MeshStandardMaterial({
    color: 0x000000,
    metalness: 0,
    roughness: 0.06,
    envMapIntensity: intensity,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

const glossBlack = () =>
  new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, metalness: 0.2, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
const matteBlack = () => new THREE.MeshStandardMaterial({ color: 0x19191b, metalness: 0.1, roughness: 0.55 });
const steel = () => new THREE.MeshStandardMaterial({ color: 0xc9c9cc, metalness: 0.95, roughness: 0.28 });
const clearPlastic = () =>
  new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.04,
    transmission: 1,
    thickness: 1.2,
    ior: 1.52,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    specularIntensity: 1,
  });
// Opaque on purpose: a transmissive part is invisible behind another transmissive part.
const coloredCore = (color: string) =>
  new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function wordmark(color: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  let fs = 100;
  const font = (size: number) => `500 ${size}px -apple-system, BlinkMacSystemFont, "Inter Variable", "Inter", sans-serif`;
  g.font = font(fs);
  fs = Math.min(110, (fs * 488) / Math.max(1, g.measureText('NoVape').width));
  g.font = font(fs);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('NoVape', 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(12.4, 3.1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  m.position.set(0, 11, 7.53);
  return m;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(236,250,242,0.7)');
  grad.addColorStop(1, 'rgba(200,240,215,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* --------------------------------- Parts --------------------------------- */

/** Smoked cap with its mouthpiece channel (the black Y) inside. */
function buildCap() {
  const g = new THREE.Group();
  const outer = loft(domeSections(24.4, 14.6, 77.8, 100, 5.3, 2.0), 112, 100);
  const inner = loft(domeSections(22.6, 12.8, 79.0, 99.75, 5.1, 2.0), 112, 99.75);
  const tint = mesh(outer, tintedGlass(0.72, 0.705, 0.69, 1.0, 1.1));
  tint.renderOrder = 2;
  const tintIn = mesh(inner, tintedGlass(0.95, 0.948, 0.945, 0.9, 2.0));
  tintIn.renderOrder = 2;
  const shine = mesh(outer, glassGloss());
  shine.renderOrder = 3;
  const rim = mesh(prism(24.3, 14.5, 7.25, 1.3, { wall: 1.0 }), tintedGlass(0.16, 0.15, 0.14, 0.9, 2.0), 0, 77.8, 0);
  rim.renderOrder = 2;
  const outlet = mesh(new THREE.ShapeGeometry(rrShape(7.2, 2.0, 1.0) as THREE.Shape, 12), new THREE.MeshBasicMaterial({ color: 0x050505 }), 0, 100.03, 0);
  outlet.rotation.x = -Math.PI / 2;
  g.add(tint, tintIn, shine, rim, outlet);
  return g;
}

/** Cartridge top: lid, stem and the Y-shaped funnel. */
function buildStem() {
  const g = new THREE.Group();
  const mat = glossBlack();
  const profile = [
    [0, 83.3], [2.1, 83.3], [2.1, 84.6], [2.45, 85.0], [2.15, 85.4], [2.05, 86.0], [2.02, 87.2],
    [2.02, 88.2], [1.92, 89.0], [1.5, 89.7], [0.8, 90.0], [0, 90.1],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  g.add(mesh(new THREE.LatheGeometry(profile, 40), mat));
  g.add(mesh(prism(10.6, 8.2, 4.1, 1.0), mat, 0, 82.3, 0));
  for (const sx of [-1, 1]) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(sx * 0.6, 88.9, 0), new THREE.Vector3(sx * 2.4, 93.6, 0), new THREE.Vector3(sx * 4.45, 98.55, 0));
    const arm = mesh(new THREE.TubeGeometry(curve, 28, 0.88, 14, false), mat);
    arm.scale.z = 1.45;
    g.add(arm);
    const v = new THREE.LineCurve3(new THREE.Vector3(0, 91.7, -0.95), new THREE.Vector3(sx * 3.3, 98.1, -1.05));
    g.add(mesh(new THREE.TubeGeometry(v, 8, 0.2, 8, false), mat));
  }
  const web = mesh(
    loft(
      [
        { y: 90.4, w: 2.6, d: 2.1 },
        { y: 92.8, w: 4.4, d: 2.2 },
        { y: 95.6, w: 6.5, d: 2.35 },
        { y: 98.6, w: 8.8, d: 2.5 },
      ],
      48,
    ),
    tintedGlass(0.86, 0.85, 0.84, 0.55, 2.6),
  );
  web.renderOrder = 1;
  g.add(web);
  const rimPts = stadiumPts(10.0, 2.9, 44).map((p) => new THREE.Vector3(p[0], 98.3, p[1]));
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 88, 0.4, 10, true), mat));
  return g;
}

/** Cartridge body (clear) with the flavoured wick. */
function buildCartridge(flavor: FlavorId) {
  const g = new THREE.Group();
  g.add(mesh(prism(10.6, 8.2, 4.1, 15.1), clearPlastic(), 0, 67.2, 0));
  g.add(mesh(disc(3.0, 12.5), coloredCore(FLAVOR_CORE[flavor]), 0, 68.8, 0));
  return g;
}

export interface DeviceModel {
  group: THREE.Group;
  /** 0…1 brightness of the light strip. */
  setLed(level: number): void;
  /** 0 = assembled, 1 = cap and cartridge lifted off. */
  setExplode(t: number): void;
  height: number;
}

const ease = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

export function buildDevice(finish: DeviceFinish, flavor: FlavorId = 'mint'): DeviceModel {
  const look = FINISH_LOOK[finish];
  const group = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({
    color: look.color,
    metalness: look.metalness,
    roughness: look.roughness,
    clearcoat: 0.35,
    clearcoatRoughness: 0.45,
    envMapIntensity: 1.1,
  });

  // Housing: straight extrusion plus the soft tuck-in above the base.
  group.add(mesh(prism(25, 15, 7.5, 67), body, 0, 10, 0));
  const foot: Section[] = [];
  for (let k = 0; k <= 12; k++) {
    const y = 2.5 + 7.5 * (k / 12);
    const s = 1.6 * Math.pow((10 - y) / 7.5, 2.2);
    foot.push({ y, w: 25 - 2 * s, d: 15 - 2 * s });
  }
  group.add(mesh(loft(foot, 96), body));
  group.add(wordmark(look.mark));

  // Base with USB-C
  group.add(mesh(prism(21.6, 11.6, 5.8, 2.8, { bevel: 0.8 }), matteBlack()));
  const usb = mesh(new THREE.ShapeGeometry(rrShape(9.2, 3.4, 1.7) as THREE.Shape, 12), new THREE.MeshBasicMaterial({ color: 0x050505 }), 0, -0.02, 0);
  usb.rotation.x = Math.PI / 2;
  const usbRim = mesh(new THREE.ShapeGeometry(rrShape(9.9, 4.1, 2.05) as THREE.Shape, 12), steel(), 0, -0.01, 0);
  usbRim.rotation.x = Math.PI / 2;
  group.add(usbRim, usb);

  // Button: aluminium key in a dark contour
  const ring = rrShape(5.4, 12.4, 2.7) as THREE.Shape;
  ring.holes.push(rrShape(4.5, 11.5, 2.25, THREE.Path) as THREE.Path);
  group.add(mesh(new THREE.ShapeGeometry(ring, 24), new THREE.MeshStandardMaterial({ color: 0x2f2a25, roughness: 0.7 }), 0, 49, 7.505));
  const key = new THREE.ExtrudeGeometry(rrShape(4.4, 11.2, 2.2) as THREE.Shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.12, bevelSegments: 4, curveSegments: 24 });
  group.add(mesh(key, body, 0, 49, 7.42));

  // Light strip with glow
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.3 });
  const led = mesh(new THREE.BoxGeometry(1.0, 7.1, 0.3), ledMat, 0, 64.15, 7.4);
  group.add(led);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xe8fff1, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(3.6, 10.5, 1);
  glow.position.set(0, 64.15, 7.9);
  group.add(glow);

  // Pod socket (stays on the device)
  const gloss = glossBlack();
  const collar = new THREE.Group();
  collar.add(mesh(prism(25, 15, 7.5, 0.8, { wall: 2.6 }), gloss, 0, 77, 0));
  collar.add(mesh(prism(18.9, 12.4, 6.2, 2.6, { hole: [10.9, 8.5, 4.2] }), gloss, 0, 77.8, 0));
  collar.add(mesh(prism(12.7, 10.2, 5.1, 4.0, { hole: [10.9, 8.5, 4.2] }), gloss, 0, 80.4, 0));
  collar.add(mesh(prism(11.9, 9.4, 4.7, 0.6, { hole: [10.9, 8.5, 4.2] }), gloss, 0, 84.4, 0));
  collar.add(mesh(prism(22, 12.5, 6, 0.4), matteBlack(), 0, 77.2, 0)); // floor under the tower
  group.add(collar);

  const pod = new THREE.Group();
  pod.add(buildCartridge(flavor), buildStem());
  group.add(pod);
  const cap = buildCap();
  group.add(cap);

  return {
    group,
    height: 100,
    setLed(level) {
      ledMat.emissiveIntensity = 0.05 + level * 3.2;
      glow.material.opacity = level * 0.5;
    },
    setExplode(t) {
      cap.position.y = 46 * ease(t / 0.6);
      pod.position.y = 26 * ease((t - 0.35) / 0.65);
    },
  };
}

/** A retail cartridge as on the product shots: smoked cap, clear body, coloured core. */
export function buildPod(flavor: FlavorId) {
  const g = new THREE.Group();
  const core = coloredCore(FLAVOR_CORE[flavor]);
  const black = glossBlack();
  // clear body with a dark seal ring at the bottom
  g.add(mesh(prism(12.8, 9.8, 4.9, 1.3, { bevel: 0.4 }), matteBlack(), 0, 0, 0));
  g.add(mesh(prism(12.8, 9.8, 4.9, 16.2), clearPlastic(), 0, 1.3, 0));
  // coloured core: spool with two flanges
  g.add(mesh(disc(4.3, 1.3), core, 0, 2.2, 0));
  g.add(mesh(disc(2.5, 8.6), core, 0, 3.5, 0));
  for (let i = 0; i < 3; i++) g.add(mesh(disc(3.4, 0.7), core, 0, 5.2 + i * 2.3, 0));
  g.add(mesh(disc(3.8, 1.1), core, 0, 12.1, 0));
  g.add(mesh(disc(1.5, 4.5), black, 0, 13.2, 0));
  // Y inside the cap
  for (const sx of [-1, 1]) {
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(sx * 0.5, 17.4, 0), new THREE.Vector3(sx * 1.6, 21.5, 0), new THREE.Vector3(sx * 3.0, 26.4, 0));
    const arm = mesh(new THREE.TubeGeometry(c, 20, 0.6, 12, false), black);
    arm.scale.z = 1.4;
    g.add(arm);
  }
  const rimPts = stadiumPts(6.8, 2.0, 36).map((p) => new THREE.Vector3(p[0], 26.5, p[1]));
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 60, 0.3, 8, true), black));
  // smoked cap
  const outer = loft(domeSections(13.4, 10.4, 17.5, 29.6, 3.6, 1.0), 96, 29.6);
  const inner = loft(domeSections(12.2, 9.2, 18.2, 29.1, 3.3, 1.0), 96, 29.1);
  const t1 = mesh(outer, tintedGlass(0.7, 0.685, 0.67, 1.0, 1.1));
  t1.renderOrder = 2;
  const t2 = mesh(inner, tintedGlass(0.95, 0.948, 0.945, 0.9, 2.0));
  t2.renderOrder = 2;
  const sh = mesh(outer, glassGloss());
  sh.renderOrder = 3;
  g.add(t1, t2, sh);
  return g;
}
