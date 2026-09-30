import { useEffect } from 'react';

/**
 * One-shot deep-link scroll for CMS editors.
 *
 * Replaces the per-page hash effects that depended on `draft`: every
 * keystroke rebuilds the draft, so an effect with `draft` in its deps
 * re-fired `open(hash)` + `scrollIntoView(hash)` on each keypress - yanking
 * the viewport back to the hashed section and collapsing the section being
 * edited (unmounting the focused input). This hook depends only on the
 * boolean `loaded` flag, which flips false→true once per data load, so
 * post-load keystrokes never re-scroll. Anchor clicks keep working through
 * their own onClick handlers (scroll + toggle + pushState).
 */
export function useCmsHashScroll(
  loaded: boolean,
  sections: readonly { id: string }[],
  onDeepLink: (id: string) => void,
): void {
  useEffect(() => {
    if (!loaded) return;
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.slice(1);
    if (!hash || !sections.some((s) => s.id === hash)) return;
    onDeepLink(hash);
    const timer = setTimeout(() => {
      try {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        /* ignore scroll failure */
      }
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on load; re-running on draft change is the bug
  }, [loaded]);
}
