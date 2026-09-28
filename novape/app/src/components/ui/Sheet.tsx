import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  /** Full-height sheet (craving flow) vs. content height (editors). */
  full?: boolean;
}

/** Bottom sheet with backdrop, exit animation, Escape to close and focus handling. */
export function Sheet({ open, onClose, label, children, full }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement;
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const id = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
      (returnFocus.current as HTMLElement | null)?.focus?.();
    }, 280);
    return () => window.clearTimeout(id);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => panel.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;
  // Portal into the app shell so the sheet sits above the tab bar and screen transitions.
  const host = document.querySelector('.shell') ?? document.body;
  return createPortal(
    <div className={`sheet-layer${closing ? ' is-closing' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={panel}
        className={`sheet${full ? ' sheet--full' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        <span className="sheet__handle" />
        {children}
      </div>
    </div>,
    host,
  );
}
