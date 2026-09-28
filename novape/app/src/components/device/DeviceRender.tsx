import { useId } from 'react';
import type { DeviceFinish } from '../../models';

const FINISHES: Record<DeviceFinish, { body: string[]; mark: string }> = {
  champagne: { body: ['#B3AB9F', '#E2DCD2', '#F4F0EA', '#D6CFC3', '#A69E91'], mark: '#4d4942' },
  black: { body: ['#121213', '#2c2c2e', '#3c3c3f', '#222224', '#0e0e0f'], mark: '#c9c9cc' },
  graphite: { body: ['#67676b', '#949498', '#ababaf', '#88888c', '#5a5a5e'], mark: '#2b2b2d' },
  sage: { body: ['#435c49', '#6b876f', '#83a086', '#5e7c66', '#3b5241'], mark: '#e4ece5' },
};

export type LedState = 'off' | 'on' | 'pulse' | 'blink';

/**
 * Vector render of the NoVape One (champagne body, smoked cap, light bar,
 * button). Used where the device needs to be animated; product photos are
 * used elsewhere.
 */
export function DeviceRender({
  height = 280,
  finish = 'champagne',
  led = 'on',
  className,
}: {
  height?: number;
  finish?: DeviceFinish;
  led?: LedState;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const f = FINISHES[finish];
  const width = (height * 120) / 400;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 400"
      className={className}
      role="img"
      aria-label="NoVape One"
    >
      <defs>
        <linearGradient id={`body${id}`} x1="0" x2="1">
          {f.body.map((c, i) => (
            <stop key={i} offset={[0, 0.24, 0.46, 0.76, 1][i]} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id={`cap${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#1b1b1d" />
          <stop offset="0.35" stopColor="#3b3b3f" />
          <stop offset="0.6" stopColor="#2a2a2d" />
          <stop offset="1" stopColor="#121213" />
        </linearGradient>
        <linearGradient id={`capv${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`shadow${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#111111" stopOpacity="0.22" />
          <stop offset="1" stopColor="#111111" stopOpacity="0" />
        </radialGradient>
        <filter id={`glow${id}`} x="-200%" y="-100%" width="500%" height="300%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <ellipse cx="60" cy="393" rx="42" ry="5" fill={`url(#shadow${id})`} />

      {/* Smoked cap with mouthpiece channel */}
      <path d="M25 108 V46 A35 35 0 0 1 95 46 V108 Z" fill={`url(#cap${id})`} />
      <path d="M25 108 V46 A35 35 0 0 1 95 46 V108 Z" fill={`url(#capv${id})`} />
      <path d="M53 22 L60 14 L67 22 V64 H53 Z" fill="#0b0b0c" opacity="0.85" />
      <rect x="44" y="62" width="32" height="30" rx="5" fill="#0b0b0c" opacity="0.9" />
      <rect x="33" y="30" width="5" height="64" rx="2.5" fill="#ffffff" opacity="0.12" />

      {/* Base */}
      <path d="M27 370 H93 C93 382 86 390 76 390 H44 C34 390 27 382 27 370 Z" fill="#1c1c1e" />

      {/* Body */}
      <path
        d="M21 118 C21 106 27 98 39 98 H81 C93 98 99 106 99 118 V352 C99 369 89 380 72 380 H48 C31 380 21 369 21 352 Z"
        fill={`url(#body${id})`}
      />
      <rect x="30" y="112" width="5" height="246" rx="2.5" fill="#ffffff" opacity="0.28" />

      {/* Light bar */}
      {led !== 'off' && (
        <rect
          x="56"
          y="146"
          width="8"
          height="26"
          rx="4"
          fill="#ffffff"
          filter={`url(#glow${id})`}
          className={led === 'pulse' ? 'led-pulse' : led === 'blink' ? 'led-blink' : undefined}
        />
      )}
      <rect x="58.6" y="148" width="2.8" height="22" rx="1.4" fill={led === 'off' ? '#8f8a82' : '#ffffff'} opacity={led === 'off' ? 0.5 : 1} />

      {/* Button */}
      <rect x="51" y="196" width="18" height="40" rx="9" fill="none" stroke="#1d1d1f" strokeOpacity="0.55" strokeWidth="1.4" />
      <rect x="52.4" y="197.4" width="15.2" height="37.2" rx="7.6" fill="#ffffff" opacity="0.08" />

      <text
        x="60"
        y="352"
        textAnchor="middle"
        fontSize="11.5"
        fontWeight="600"
        letterSpacing="-0.2"
        fill={f.mark}
        opacity="0.8"
        fontFamily="var(--font)"
      >
        NoVape
      </text>
    </svg>
  );
}
