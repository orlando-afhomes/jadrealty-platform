import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query (DESIGN-SYSTEM §5 breakpoints). Returns the
 * current match state. Safely returns `false` when `matchMedia` is unavailable
 * (e.g., jsdom without a stub) so consumers degrade to the mobile layout.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent): void => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
