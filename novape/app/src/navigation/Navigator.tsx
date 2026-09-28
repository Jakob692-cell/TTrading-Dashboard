import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type Tab = 'home' | 'stats' | 'goals' | 'profile';

export type Route =
  | { name: 'device' }
  | { name: 'flavors' }
  | { name: 'achievements' }
  | { name: 'notifications' }
  | { name: 'insights' }
  | { name: 'privacy' }
  | { name: 'account' }
  | { name: 'help' }
  | { name: 'about' };

export type Direction = 'push' | 'pop' | 'tab';

interface NavState {
  tab: Tab;
  stack: Route[];
  direction: Direction;
  /** Changes on every navigation; used as the screen key so transitions replay. */
  key: number;
}

interface NavApi extends NavState {
  push(route: Route): void;
  pop(): void;
  switchTab(tab: Tab): void;
  top: Route | null;
}

const NavContext = createContext<NavApi | null>(null);

/** Inside an iframe (e.g. a shared preview) the browser history belongs to the host page, so leave it alone. */
const embedded = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

function pushHistory() {
  if (embedded) return false;
  try {
    window.history.pushState({ novape: true }, '');
    return true;
  } catch {
    return false;
  }
}

/**
 * Minimal tab + stack navigator. Pushed routes add a browser history entry so
 * the system back gesture/button pops them.
 */
export function NavigatorProvider({ children }: { children: ReactNode }) {
  const [nav, setNav] = useState<NavState>({ tab: 'home', stack: [], direction: 'tab', key: 0 });
  const historyDepth = useRef(0);

  const popInternal = useCallback(() => {
    setNav((n) => (n.stack.length ? { ...n, stack: n.stack.slice(0, -1), direction: 'pop', key: n.key + 1 } : n));
  }, []);

  useEffect(() => {
    const onPop = () => {
      if (historyDepth.current > 0) {
        historyDepth.current -= 1;
        popInternal();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [popInternal]);

  const push = useCallback((route: Route) => {
    if (pushHistory()) historyDepth.current += 1;
    setNav((n) => ({ ...n, stack: [...n.stack, route], direction: 'push', key: n.key + 1 }));
  }, []);

  const pop = useCallback(() => {
    if (historyDepth.current > 0) {
      try {
        window.history.back();
        return;
      } catch {
        historyDepth.current = 0;
      }
    }
    popInternal();
  }, [popInternal]);

  const switchTab = useCallback((tab: Tab) => {
    historyDepth.current = 0;
    setNav((n) => (n.tab === tab && n.stack.length === 0 ? n : { tab, stack: [], direction: 'tab', key: n.key + 1 }));
  }, []);

  const value = useMemo<NavApi>(
    () => ({ ...nav, push, pop, switchTab, top: nav.stack[nav.stack.length - 1] ?? null }),
    [nav, push, pop, switchTab],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavApi {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside <NavigatorProvider>');
  return ctx;
}
