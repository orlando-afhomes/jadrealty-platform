import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCmsHashScroll } from './useCmsHashScroll';

const SECTIONS = [{ id: 'register' }, { id: 'fields' }] as const;

describe('useCmsHashScroll', () => {
  beforeEach(() => {
    window.location.hash = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    window.location.hash = '';
  });

  it('scrolls to the hashed section once the content loads', () => {
    window.location.hash = '#fields';
    const target = document.createElement('div');
    target.id = 'fields';
    document.body.appendChild(target);
    const scrollSpy = vi.fn();
    target.scrollIntoView = scrollSpy;
    const onDeepLink = vi.fn();

    const { rerender, unmount } = renderHook(({ loaded }) => useCmsHashScroll(loaded, SECTIONS, onDeepLink), {
      initialProps: { loaded: false },
    });
    expect(onDeepLink).not.toHaveBeenCalled();

    rerender({ loaded: true });
    expect(onDeepLink).toHaveBeenCalledTimes(1);
    expect(onDeepLink).toHaveBeenCalledWith('fields');
    act(() => {
      vi.runAllTimers();
    });
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    unmount();
    target.remove();
  });

  it('never re-scrolls when the draft changes after load', () => {
    window.location.hash = '#fields';
    const target = document.createElement('div');
    target.id = 'fields';
    document.body.appendChild(target);
    const scrollSpy = vi.fn();
    target.scrollIntoView = scrollSpy;
    const onDeepLink = vi.fn();

    const { rerender, unmount } = renderHook(
      ({ loaded }) => useCmsHashScroll(loaded, SECTIONS, onDeepLink),
      { initialProps: { loaded: false } },
    );
    rerender({ loaded: true });
    act(() => {
      vi.runAllTimers();
    });
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    // Simulate post-load re-renders (keystrokes change draft, not loaded).
    rerender({ loaded: true });
    rerender({ loaded: true });
    act(() => {
      vi.runAllTimers();
    });
    expect(onDeepLink).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    unmount();
    target.remove();
  });

  it('does nothing without a matching hash', () => {
    window.location.hash = '#unknown';
    const onDeepLink = vi.fn();
    const { unmount } = renderHook(() => useCmsHashScroll(true, SECTIONS, onDeepLink));
    act(() => {
      vi.runAllTimers();
    });
    expect(onDeepLink).not.toHaveBeenCalled();
    unmount();
  });
});
