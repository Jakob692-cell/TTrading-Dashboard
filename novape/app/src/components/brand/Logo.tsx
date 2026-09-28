/** Open ring: the loop of a habit, deliberately left open. */
export function LogoMark({ size = 72, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      aria-hidden="true"
      className={animated ? 'logo-mark logo-mark--animated' : 'logo-mark'}
    >
      <circle
        cx="36"
        cy="36"
        r="27"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="134 35.65"
        transform="rotate(-48 36 36)"
      />
    </svg>
  );
}

export function Logo({ size = 88 }: { size?: number }) {
  return (
    <div className="stack" style={{ alignItems: 'center', gap: 18 }}>
      <LogoMark size={size} animated />
      <span className="num enter" style={{ fontSize: 36, lineHeight: '40px', letterSpacing: '-0.045em', ['--i' as string]: 2 }}>
        NoVape
      </span>
    </div>
  );
}
