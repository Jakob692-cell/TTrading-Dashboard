import { useEffect, useRef, useState } from 'react';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Counts from the previous value (0 on mount) to `target`. */
export function useCountUp(target: number, duration = 900, decimals = 0): number {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);
  const from = useRef(prefersReducedMotion() ? target : 0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = origin + (target - origin) * easeOutCubic(t);
      const factor = Math.pow(10, decimals);
      setValue(Math.round(v * factor) / factor);
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, duration, decimals]);

  return value;
}

/** false on the first paint, true right after — lets CSS transitions animate from an initial state. */
export function useAppeared(delay = 30): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setOn(true), delay);
    return () => window.clearTimeout(id);
  }, [delay]);
  return on;
}

/** Re-renders every `ms` so time-based UI (today, greetings) stays current. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}
