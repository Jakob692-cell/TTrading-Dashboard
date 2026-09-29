import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { SceneSpec, StageHandle, StageOptions } from '../../three/stage';

type StageModule = typeof import('../../three/stage');

/** Studio backdrops (top, bottom) that blend into the surfaces around them. */
export const BACKDROP = {
  page: ['#ffffff', '#ffffff'],
  studio: ['#eeebe7', '#dbd6d0'],
  soft: ['#f3f1ee', '#e5e1dc'],
} satisfies Record<string, [string, string]>;
let stageModule: Promise<StageModule> | null = null;

/** The 3D engine (three.js) is loaded on first use, so the app starts fast. */
export function loadStage() {
  stageModule ??= import('../../three/stage');
  return stageModule;
}

/**
 * Live, lit 3D scene of the NoVape One (or a cartridge). Shows `fallback`
 * until the engine is ready — and keeps showing it where WebGL is missing.
 */
export function Scene3D({
  spec,
  options,
  label,
  fallback,
  className,
  style,
}: {
  spec: SceneSpec;
  options?: StageOptions;
  label: string;
  fallback?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<StageHandle | null>(null);
  const latest = useRef(spec);
  latest.current = spec;
  const [ready, setReady] = useState(false);
  const optionsKey = JSON.stringify(options ?? {});
  const specKey = JSON.stringify(spec);

  useEffect(() => {
    let alive = true;
    loadStage()
      .then((m) => {
        if (!alive || !host.current || !m.webglAvailable()) return;
        handle.current = m.mountStage(host.current, latest.current, JSON.parse(optionsKey) as StageOptions);
        // one frame later, so the first render is on screen before the fallback fades
        requestAnimationFrame(() => alive && setReady(true));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      handle.current?.dispose();
      handle.current = null;
      setReady(false);
    };
  }, [optionsKey]);

  useEffect(() => {
    handle.current?.update(latest.current);
  }, [specKey]);

  return (
    <div className={`scene3d${ready ? ' is-ready' : ''}${className ? ` ${className}` : ''}`} style={style} role="img" aria-label={label}>
      <div ref={host} className="scene3d__canvas" />
      {fallback && (
        <div className="scene3d__fallback" aria-hidden="true">
          {fallback}
        </div>
      )}
    </div>
  );
}

/**
 * A single rendered frame as an image — for small thumbnails, where a live
 * WebGL canvas per item would be wasteful. Shows `fallback` until rendered.
 */
export function Still3D({
  spec,
  width,
  height,
  backdrop,
  yaw,
  alt,
  fallback,
  className,
}: {
  spec: SceneSpec;
  width: number;
  height: number;
  backdrop?: [string, string];
  yaw?: number;
  alt: string;
  fallback?: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const key = JSON.stringify([spec, width, height, backdrop, yaw]);
  useEffect(() => {
    let alive = true;
    loadStage()
      .then((m) => (m.webglAvailable() ? m.renderStill(spec, width, height, { backdrop, yaw }) : null))
      .then((url) => alive && url && setSrc(url))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key]);
  const shown = src ?? fallback;
  if (!shown) return <span className={className} aria-label={alt} role="img" />;
  return <img src={shown} alt={alt} className={className} width={width} height={height} draggable={false} />;
}
