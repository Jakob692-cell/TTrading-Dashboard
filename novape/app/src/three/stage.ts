import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { DeviceFinish, FlavorId } from '../models';
import { buildDevice, buildPod, type DeviceModel } from './models';

export type LedState = 'off' | 'on' | 'pulse' | 'blink';
export type DeviceView = 'hero' | 'head' | 'exploded' | 'portrait';

export type SceneSpec =
  | { kind: 'device'; finish: DeviceFinish; flavor?: FlavorId; led?: LedState; view?: DeviceView; buzz?: boolean; searching?: boolean }
  | { kind: 'pod'; flavor: FlavorId }
  | { kind: 'kit'; finish: DeviceFinish }
  | { kind: 'finishes'; active: DeviceFinish };

export interface StageOptions {
  /** Top and bottom colour of the studio backdrop. */
  backdrop?: [string, string];
  /** Drag to rotate. */
  interactive?: boolean;
  /** Idle motion when nobody touches it. */
  motion?: 'oscillate' | 'spin' | 'none';
  /** Gently bob up and down above the floor. */
  float?: boolean;
}

export interface StageHandle {
  update(spec: SceneSpec): void;
  dispose(): void;
}

const FOV = 28;
const ELEVATION = 0.1; // rad, camera slightly above
const DEFAULT_BACKDROP: [string, string] = ['#f4f2ef', '#e4e0db'];

interface Framing {
  center: THREE.Vector3;
  width: number;
  height: number;
}

/* ------------------------------ Shared bits ------------------------------ */

let shadowTex: THREE.Texture | null = null;
function contactShadow(w: number, d: number, opacity = 0.5) {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(20,18,15,0.55)');
    grad.addColorStop(0.45, 'rgba(20,18,15,0.22)');
    grad.addColorStop(1, 'rgba(20,18,15,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity, depthWrite: false, toneMapped: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = -1;
  return m;
}

function backdropTexture([top, bottom]: [string, string]) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeRenderer(canvas?: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

function studio(renderer: THREE.WebGLRenderer, backdrop: [string, string]) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.9;
  scene.background = backdropTexture(backdrop);
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(-40, 160, 70);
  const rim = new THREE.DirectionalLight(0xfff4e8, 0.9);
  rim.position.set(90, 60, -80);
  const fill = new THREE.HemisphereLight(0xffffff, 0xd9d4cc, 0.35);
  scene.add(key, rim, fill);
  return scene;
}

function disposeTree(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    mats.forEach((mat) => {
      const tex = (mat as THREE.MeshBasicMaterial).map;
      if (tex && tex !== shadowTex) tex.dispose();
      mat.dispose();
    });
  });
}

/* ------------------------------- Scene content ------------------------------- */

interface Content {
  root: THREE.Group; // rotated as a whole
  pivot: THREE.Vector3;
  framing: (spec: SceneSpec) => Framing;
  device?: DeviceModel;
  shadow?: THREE.Mesh;
  rings?: THREE.Mesh[];
  baseYaw: number;
}

function searchRings() {
  return [0, 1].map(() => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(17, 18.6, 72),
      new THREE.MeshBasicMaterial({ color: 0x7fbf9a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.05;
    m.visible = false;
    return m;
  });
}

function buildContent(spec: SceneSpec): Content {
  const root = new THREE.Group();
  switch (spec.kind) {
    case 'device': {
      const device = buildDevice(spec.finish, spec.flavor ?? 'mint');
      const shadow = contactShadow(46, 34, 0.55);
      const rings = searchRings();
      root.add(device.group, shadow, ...rings);
      return {
        root,
        device,
        shadow,
        rings,
        pivot: new THREE.Vector3(0, 0, 0),
        baseYaw: -0.38,
        framing: (s) => {
          const view = s.kind === 'device' ? (s.view ?? 'hero') : 'hero';
          if (view === 'head') return { center: new THREE.Vector3(0, 88.5, 0), width: 32, height: 34 };
          if (view === 'exploded') return { center: new THREE.Vector3(0, 74, 0), width: 34, height: 152 };
          if (view === 'portrait') return { center: new THREE.Vector3(0, 71, 0), width: 30, height: 60 };
          return { center: new THREE.Vector3(0, 50, 0), width: 34, height: 112 };
        },
      };
    }
    case 'pod': {
      const pod = buildPod(spec.flavor);
      root.add(pod, contactShadow(26, 20, 0.45));
      return { root, pivot: new THREE.Vector3(), baseYaw: -0.45, framing: () => ({ center: new THREE.Vector3(0, 14.8, 0), width: 18, height: 33 }) };
    }
    case 'kit': {
      const device = buildDevice(spec.finish, 'mint');
      device.group.position.set(-13, 0, 0);
      root.add(device.group, contactShadow(46, 34, 0.5));
      root.children[root.children.length - 1].position.x = -13;
      (['mint', 'lemon', 'berry'] as FlavorId[]).forEach((f, i) => {
        const pod = buildPod(f);
        pod.position.set(9 + i * 14.5, 0, 8 - i * 4);
        pod.rotation.y = -0.25 + i * 0.12;
        const sh = contactShadow(24, 18, 0.4);
        sh.position.set(pod.position.x, 0.02, pod.position.z);
        root.add(pod, sh);
      });
      return { root, device, pivot: new THREE.Vector3(8, 0, 2), baseYaw: -0.3, framing: () => ({ center: new THREE.Vector3(8, 48, 0), width: 78, height: 108 }) };
    }
    case 'finishes': {
      const order: DeviceFinish[] = ['champagne', 'black', 'graphite', 'sage'];
      order.forEach((f, i) => {
        const d = buildDevice(f, 'mint');
        const x = (i - 1.5) * 31;
        d.group.position.set(x, 0, f === spec.active ? 10 : 0);
        d.group.rotation.y = -0.35 + (i - 1.5) * 0.08;
        const sh = contactShadow(46, 34, 0.45);
        sh.position.set(x, 0.02, d.group.position.z);
        root.add(d.group, sh);
      });
      return { root, pivot: new THREE.Vector3(), baseYaw: 0, framing: () => ({ center: new THREE.Vector3(0, 50, 4), width: 128, height: 112 }) };
    }
  }
}

const sameContent = (a: SceneSpec, b: SceneSpec) => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'device' && b.kind === 'device') return a.finish === b.finish && (a.flavor ?? 'mint') === (b.flavor ?? 'mint');
  if (a.kind === 'pod' && b.kind === 'pod') return a.flavor === b.flavor;
  if (a.kind === 'kit' && b.kind === 'kit') return a.finish === b.finish;
  if (a.kind === 'finishes' && b.kind === 'finishes') return a.active === b.active;
  return false;
};

function ledLevel(state: LedState | undefined, t: number) {
  switch (state) {
    case 'on':
      return 1;
    case 'pulse':
      return 0.25 + 0.75 * (0.5 - 0.5 * Math.cos((t / 2.4) * Math.PI * 2));
    case 'blink':
      return 0.1 + 0.9 * (0.5 - 0.5 * Math.cos((t / 0.6) * Math.PI * 2));
    default:
      return 0;
  }
}

function fitDistance(f: Framing, aspect: number) {
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  return Math.max(f.height / 2 / tan, f.width / 2 / (tan * aspect)) * 1.08;
}

/* --------------------------------- Live stage --------------------------------- */

export function mountStage(host: HTMLElement, initial: SceneSpec, opts: StageOptions = {}): StageHandle {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const motion = reduced ? 'none' : (opts.motion ?? 'oscillate');
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;outline:none';
  host.appendChild(canvas);
  const renderer = makeRenderer(canvas);
  const scene = studio(renderer, opts.backdrop ?? DEFAULT_BACKDROP);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 3000);

  let spec = initial;
  let content = buildContent(spec);
  const holder = new THREE.Group(); // positioned at the pivot, rotated by the user
  scene.add(holder);
  const attach = () => {
    content.root.position.copy(content.pivot).multiplyScalar(-1);
    holder.position.copy(content.pivot);
    holder.add(content.root);
  };
  attach();

  const cam = { target: new THREE.Vector3(), dist: 200 };
  let aspect = 1;
  let explode = spec.kind === 'device' && spec.view === 'exploded' ? 1 : 0;
  let yawUser = 0;
  let yawVel = 0;
  let pitchUser = 0;
  let dragging = false;
  let clock = 0;
  let last = performance.now();
  let visible = true;
  let raf = 0;
  let settled = false;

  const goal = () => {
    const f = content.framing(spec);
    return { target: f.center, dist: fitDistance(f, aspect) };
  };
  const snap = () => {
    const g = goal();
    cam.target.copy(g.target);
    cam.dist = g.dist;
  };

  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    settled = false;
    kick();
  };

  const frame = () => {
    raf = 0;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;

    const g = goal();
    const k = 1 - Math.exp(-dt * 5);
    cam.target.lerp(g.target, k);
    cam.dist += (g.dist - cam.dist) * k;
    const wantExplode = spec.kind === 'device' && spec.view === 'exploded' ? 1 : 0;
    explode += (wantExplode - explode) * (1 - Math.exp(-dt * 3.2));
    content.device?.setExplode(explode);

    if (!dragging) {
      yawUser += yawVel * dt;
      yawVel *= Math.exp(-dt * 3.5);
      pitchUser *= Math.exp(-dt * 4);
    }
    let idle = 0;
    if (motion === 'oscillate') idle = 0.42 * Math.sin(clock * 0.42);
    else if (motion === 'spin') idle = clock * 0.45;
    holder.rotation.y = content.baseYaw + idle + yawUser;
    holder.rotation.x = pitchUser;

    const buzz = spec.kind === 'device' && spec.buzz;
    content.root.position.x = -content.pivot.x + (buzz ? Math.sin(clock * 110) * 0.35 : 0);
    if (content.device && opts.float && !reduced) {
      const bob = Math.sin(clock * 1.15);
      content.device.group.position.y = 3 + 2.2 * bob;
      if (content.shadow) {
        content.shadow.scale.setScalar(1 - 0.07 * bob);
        (content.shadow.material as THREE.MeshBasicMaterial).opacity = 0.42 - 0.08 * bob;
      }
    }
    const searching = spec.kind === 'device' && !!spec.searching;
    content.rings?.forEach((ring, i) => {
      ring.visible = searching;
      if (!searching) return;
      const phase = ((clock / 2.6 + i * 0.5) % 1 + 1) % 1;
      ring.scale.setScalar(0.55 + phase * 1.25);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - phase);
    });
    content.device?.setLed(ledLevel(spec.kind === 'device' ? spec.led : undefined, clock));

    camera.position.set(cam.target.x, cam.target.y + Math.sin(ELEVATION) * cam.dist, cam.target.z + Math.cos(ELEVATION) * cam.dist);
    camera.lookAt(cam.target);
    renderer.render(scene, camera);

    const moving =
      motion !== 'none' ||
      dragging ||
      Math.abs(yawVel) > 1e-3 ||
      Math.abs(pitchUser) > 1e-3 ||
      Math.abs(explode - wantExplode) > 1e-3 ||
      cam.target.distanceTo(g.target) > 0.05 ||
      Math.abs(cam.dist - g.dist) > 0.05 ||
      (!!opts.float && !reduced) ||
      (spec.kind === 'device' && (spec.led === 'pulse' || spec.led === 'blink' || !!spec.buzz || !!spec.searching));
    settled = !moving;
    if (!settled) kick();
  };
  function kick() {
    if (!raf && visible && document.visibilityState === 'visible') {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  // Drag to rotate (horizontal drags only, so the page still scrolls vertically)
  let px = 0;
  let py = 0;
  let lastMove = 0;
  const onDown = (e: PointerEvent) => {
    if (!opts.interactive) return;
    dragging = true;
    px = e.clientX;
    py = e.clientY;
    lastMove = performance.now();
    yawVel = 0;
    canvas.setPointerCapture(e.pointerId);
    kick();
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - px;
    const dy = e.clientY - py;
    px = e.clientX;
    py = e.clientY;
    const now = performance.now();
    const dts = Math.max(0.008, (now - lastMove) / 1000);
    lastMove = now;
    const dyaw = dx * 0.012;
    yawUser += dyaw;
    yawVel = dyaw / dts;
    pitchUser = Math.max(-0.28, Math.min(0.28, pitchUser + dy * 0.004));
    kick();
  };
  const onUp = () => {
    dragging = false;
    kick();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) kick();
  });
  io.observe(host);
  const onVis = () => kick();
  document.addEventListener('visibilitychange', onVis);

  resize();
  snap();
  kick();

  return {
    update(next) {
      if (!sameContent(spec, next)) {
        holder.remove(content.root);
        disposeTree(content.root);
        spec = next;
        content = buildContent(spec);
        attach();
      } else {
        spec = next;
      }
      settled = false;
      kick();
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      disposeTree(scene);
      scene.environment?.dispose();
      (scene.background as THREE.Texture | null)?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

/* ------------------------------ Still renders ------------------------------ */

let stillRenderer: THREE.WebGLRenderer | null = null;
const stillCache = new Map<string, Promise<string>>();

/**
 * Renders a scene once into an image (for list thumbnails), sharing one WebGL
 * context for all of them. Cached per spec and size.
 */
export function renderStill(spec: SceneSpec, width: number, height: number, opts: { backdrop?: [string, string]; yaw?: number } = {}): Promise<string> {
  const key = JSON.stringify([spec, width, height, opts]);
  const hit = stillCache.get(key);
  if (hit) return hit;
  const job = new Promise<string>((resolve) => {
    // Let the page paint first; thumbnails are never urgent.
    const run = () => {
      if (!stillRenderer) stillRenderer = makeRenderer();
      const r = stillRenderer;
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.setSize(width, height, false);
      const scene = studio(r, opts.backdrop ?? DEFAULT_BACKDROP);
      const content = buildContent(spec);
      const holder = new THREE.Group();
      content.root.position.copy(content.pivot).multiplyScalar(-1);
      holder.position.copy(content.pivot);
      holder.add(content.root);
      holder.rotation.y = content.baseYaw + (opts.yaw ?? 0);
      scene.add(holder);
      const f = content.framing(spec);
      const camera = new THREE.PerspectiveCamera(FOV, width / height, 1, 3000);
      const dist = fitDistance(f, width / height);
      camera.position.set(f.center.x, f.center.y + Math.sin(ELEVATION) * dist, f.center.z + Math.cos(ELEVATION) * dist);
      camera.lookAt(f.center);
      content.device?.setLed(spec.kind === 'device' && spec.led === 'on' ? 1 : 0);
      r.render(scene, camera);
      const url = r.domElement.toDataURL('image/png');
      disposeTree(scene);
      scene.environment?.dispose();
      (scene.background as THREE.Texture | null)?.dispose();
      resolve(url);
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(run);
    else setTimeout(run, 30);
  });
  stillCache.set(key, job);
  return job;
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
