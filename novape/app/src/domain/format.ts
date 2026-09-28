import type { Intention } from '../models';

export function formatEuro(value: number): string {
  if (value >= 10) return `€${Math.round(value)}`;
  return `€${value.toFixed(2).replace(/\.00$/, '')}`;
}

/** 0.51 → "51%" */
export function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** −0.51 → "−51%", 0.12 → "+12%" (true minus sign). */
export function formatSignedPercent(share: number): string {
  const pct = Math.round(share * 100);
  if (pct === 0) return '0%';
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const INTENTION_LABELS: Record<Intention, string> = {
  quit: 'Stop vaping completely',
  reduce: 'Vape less',
  understand: 'Understand my habits',
};
