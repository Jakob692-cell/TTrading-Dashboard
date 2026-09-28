import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/ui/Icon';

interface UiApi {
  toast(message: string): void;
  cravingOpen: boolean;
  openCraving(): void;
  closeCraving(): void;
}

const UiContext = createContext<UiApi | null>(null);

/** App-wide UI state: toasts and the craving check-in sheet. */
export function UiProvider({ children }: { children: ReactNode }) {
  const [toastMsg, setToastMsg] = useState<{ id: number; text: string } | null>(null);
  const [cravingOpen, setCravingOpen] = useState(false);
  const timer = useRef<number>(0);

  const toast = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setToastMsg({ id: Date.now(), text });
    timer.current = window.setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const value = useMemo<UiApi>(
    () => ({
      toast,
      cravingOpen,
      openCraving: () => setCravingOpen(true),
      closeCraving: () => setCravingOpen(false),
    }),
    [toast, cravingOpen],
  );

  return (
    <UiContext.Provider value={value}>
      {children}
      {toastMsg && (
        <div key={toastMsg.id} className="toast" role="status" aria-live="polite">
          <Icon name="check" size={16} strokeWidth={2.2} />
          {toastMsg.text}
        </div>
      )}
    </UiContext.Provider>
  );
}

export function useUi(): UiApi {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside <UiProvider>');
  return ctx;
}
