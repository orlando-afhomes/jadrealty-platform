import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * Distance (px) from the bottom that still counts as "reading the latest".
 * A reader inside this band follows new arrivals; anyone scrolled further
 * up is intentionally viewing history and is left alone.
 */
export const SCROLL_STICK_THRESHOLD_PX = 120;

export interface ScrollToLatest {
  /** Jump to the latest item unconditionally (open, own send). */
  scrollToLatest: () => void;
  /** Jump only when the reader is already near the bottom (new arrivals). */
  scrollToLatestIfNearBottom: () => void;
}

/**
 * Chat-thread scroll management for a scrollable container ref.
 *
 * - The first time `itemCount` becomes non-zero the container jumps to the
 *   latest item (conversation opened).
 * - Later growth scrolls only when the reader is near the bottom, so reading
 *   older messages (or paging history in) never yanks the viewport.
 * - `scrollToLatest` stays available for explicit triggers (the user's own
 *   send always jumps - that is their action, never a surprise).
 * - Pass `resetKey` when the container is reused across conversations so the
 *   next thread opens at its latest message too.
 *
 * Writes run in `requestAnimationFrame` so they land after the new items
 * paint; a pending frame is cancelled on unmount.
 */
export function useScrollToLatest<T extends HTMLElement>(
  ref: RefObject<T | null>,
  itemCount: number,
  resetKey?: unknown,
): ScrollToLatest {
  const rafRef = useRef<number | null>(null);
  const openedRef = useRef(false);
  const prevKeyRef = useRef(resetKey);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  const scrollToLatest = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      el.scrollTop = el.scrollHeight;
    });
  }, [ref]);

  const scrollToLatestIfNearBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance <= SCROLL_STICK_THRESHOLD_PX) scrollToLatest();
  }, [ref, scrollToLatest]);

  useEffect(() => {
    if (itemCount === 0) {
      prevKeyRef.current = resetKey;
      return;
    }
    // A new conversation (or the first content) always opens at the latest
    // message; later growth only follows when the reader is near the bottom.
    if (prevKeyRef.current !== resetKey || !openedRef.current) {
      prevKeyRef.current = resetKey;
      openedRef.current = true;
      scrollToLatest();
      return;
    }
    scrollToLatestIfNearBottom();
  }, [itemCount, resetKey, scrollToLatest, scrollToLatestIfNearBottom]);

  return { scrollToLatest, scrollToLatestIfNearBottom };
}
