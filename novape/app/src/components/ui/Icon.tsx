import type { SVGProps } from 'react';

/** Minimal outline icon set (24px grid, 1.7 stroke). */
const PATHS = {
  home: <path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" strokeLinejoin="round" />,
  stats: <path d="M5 20v-8M12 20V5M19 20v-5" strokeLinecap="round" />,
  goals: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" strokeLinecap="round" />
    </>
  ),
  chevronRight: <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />,
  close: <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />,
  plus: <path d="M6 12h12M12 6v12" strokeLinecap="round" />,
  minus: <path d="M6 12h12" strokeLinecap="round" />,
  check: <path d="M5.5 12.5l4 4 9-9" strokeLinecap="round" strokeLinejoin="round" />,
  wave: (
    <>
      <path d="M3 9.5c2.2 0 2.8-2.5 5-2.5s2.8 2.5 5 2.5 2.8-2.5 5-2.5" strokeLinecap="round" />
      <path d="M3 15.5c2.2 0 2.8-2.5 5-2.5s2.8 2.5 5 2.5 2.8-2.5 5-2.5" strokeLinecap="round" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" strokeLinejoin="round" />
      <path d="M10 20.5a2 2 0 0 0 4 0" strokeLinecap="round" />
    </>
  ),
  shield: <path d="M12 3.5l7 3v5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9v-5z" strokeLinejoin="round" />,
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.8 9.5a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.4" strokeLinecap="round" />
      <circle cx="12" cy="16.6" r=".7" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r=".7" fill="currentColor" stroke="none" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 12.2l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  cartridge: (
    <>
      <rect x="8" y="3" width="8" height="18" rx="4" />
      <path d="M8 9h8" />
    </>
  ),
  device: (
    <>
      <rect x="8.5" y="2.5" width="7" height="19" rx="3.5" />
      <path d="M12 8.5v1.5" strokeLinecap="round" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" strokeLinecap="round" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  download: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" strokeLinecap="round" strokeLinejoin="round" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" strokeLinecap="round" strokeLinejoin="round" />,
  bluetooth: <path d="M7 7.5l10 9-5 4.5V3l5 4.5-10 9" strokeLinecap="round" strokeLinejoin="round" />,
  sparkle: <path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2 2M15 15l2 2M17 7l-2 2M9 15l-2 2" strokeLinecap="round" />,
  refresh: <path d="M19 12a7 7 0 1 1-2.05-4.95M19 5v3.5h-3.5" strokeLinecap="round" strokeLinejoin="round" />,
  leaf: (
    <>
      <path d="M4 14c3-1 5-4 8-4s5 3 8 4" strokeLinecap="round" />
      <path d="M4 18.5c3-1 5-4 8-4s5 3 8 4" strokeLinecap="round" />
      <circle cx="12" cy="5.5" r="1.8" />
    </>
  ),
  battery: (
    <>
      <rect x="3" y="8" width="16" height="8" rx="2" />
      <path d="M21 11v2" strokeLinecap="round" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" strokeLinecap="round" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
      <path d="M4.5 7.5l7.5 5.5 7.5-5.5" strokeLinejoin="round" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, strokeWidth = 1.7, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
