import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { useAppeared, useCountUp } from '../../hooks/motion';

export function ScreenHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="screen-header enter">
      <h1 className="title-xl">{title}</h1>
      {subtitle && <p className="subtitle">{subtitle}</p>}
      {children}
    </header>
  );
}

export function SectionHeader({ label, aside, id }: { label: string; aside?: ReactNode; id?: string }) {
  return (
    <div className="section-head">
      <h2 className="label" id={id}>
        {label}
      </h2>
      {aside && <span className="small muted">{aside}</span>}
    </div>
  );
}

export function MetricTile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="tile metric">
      <div className="metric__value">{value}</div>
      <div className="metric__label">{label}</div>
    </div>
  );
}

export function AnimatedNumber({ value, format }: { value: number; format?: (n: number) => string }) {
  const shown = useCountUp(value);
  return <>{format ? format(shown) : shown}</>;
}

export function ProgressBar({
  value,
  color,
  thin,
  label,
}: {
  value: number;
  color?: string;
  thin?: boolean;
  label?: string;
}) {
  const appeared = useAppeared();
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className={`bar${thin ? ' bar--thin' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <div className="bar__fill" style={{ transform: `scaleX(${appeared ? v : 0})`, background: color }} />
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle${on ? ' is-on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span className="toggle__knob" />
    </button>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`segmented__item${o.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ListRow({
  icon,
  title,
  sub,
  value,
  onClick,
  chevron = true,
  trailing,
}: {
  icon?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      {icon && <span className="list-row__icon">{icon}</span>}
      <span className="list-row__text">
        <span className="list-row__title">{title}</span>
        {sub && <span className="list-row__sub">{sub}</span>}
      </span>
      {value != null && <span className="list-row__value">{value}</span>}
      {trailing}
      {onClick && chevron && <Icon name="chevronRight" size={15} strokeWidth={2} className="chevron" />}
    </>
  );
  return onClick ? (
    <button type="button" className="list-row" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="list-row">{body}</div>
  );
}

export function Stepper({
  value,
  onChange,
  step = 5,
  min = 0,
  max = 400,
  unit,
  size = 'lg',
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  size?: 'md' | 'lg' | 'xl';
  format?: (v: number) => string;
}) {
  const fontSize = size === 'xl' ? 88 : size === 'md' ? 44 : 64;
  return (
    <div className="stepper">
      <button
        type="button"
        className="icon-btn icon-btn--round"
        style={{ width: 52, height: 52 }}
        onClick={() => onChange(Math.max(min, value - step))}
        aria-label={`Decrease by ${step}`}
        disabled={value <= min}
      >
        <Icon name="minus" size={20} strokeWidth={2} />
      </button>
      <div className="stepper__value" aria-live="polite">
        <span className="num" style={{ fontSize, lineHeight: 1.05, letterSpacing: '-0.055em' }}>
          {format ? format(value) : value}
        </span>
        {unit && <span className="muted" style={{ fontSize: 15 }}>{unit}</span>}
      </div>
      <button
        type="button"
        className="icon-btn icon-btn--round"
        style={{ width: 52, height: 52 }}
        onClick={() => onChange(Math.min(max, value + step))}
        aria-label={`Increase by ${step}`}
        disabled={value >= max}
      >
        <Icon name="plus" size={20} strokeWidth={2} />
      </button>
    </div>
  );
}

export function RangeSlider({
  value,
  min,
  max,
  step,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="range">
      <div className="range__track" />
      <div className="range__fill" style={{ width: `${pct}%` }} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Callout({ icon = 'leaf', children, tone = 'accent' }: { icon?: Parameters<typeof Icon>[0]['name']; children: ReactNode; tone?: 'accent' | 'neutral' }) {
  return (
    <div className={`callout${tone === 'neutral' ? ' callout--neutral' : ''}`}>
      <Icon name={icon} size={20} style={{ color: tone === 'neutral' ? '#777777' : '#4e8f6a' }} />
      <div>{children}</div>
    </div>
  );
}
