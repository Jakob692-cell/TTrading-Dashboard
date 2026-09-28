import type { Flavor, FlavorId } from '../models';

export const FLAVORS: Flavor[] = [
  { id: 'mint', name: 'Mint', notes: 'Cool spearmint. Clean, crisp finish.', accent: '#7CC3A0', tint: '#F1F8F4' },
  { id: 'lemon', name: 'Lemon', notes: 'Bright citrus peel. Light and fresh.', accent: '#E3C766', tint: '#FBF8EC' },
  { id: 'berry', name: 'Berry', notes: 'Soft red berries. Gently sweet.', accent: '#D98F9E', tint: '#FAF1F3' },
];

export const flavorById = (id: FlavorId): Flavor => FLAVORS.find((f) => f.id === id) ?? FLAVORS[0];
