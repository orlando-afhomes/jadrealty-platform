import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useLayoutEffect, useRef, useState } from 'react';

import { useScrollToLatest, SCROLL_STICK_THRESHOLD_PX } from './useScrollToLatest.js';

const ITEM_HEIGHT = 40;
const VIEW_HEIGHT = 200;

/** Give the thread element deterministic scroll geometry (jsdom has no layout). */
function geometry(el: HTMLElement, messageCount: number) {
  const scrollHeight = messageCount * ITEM_HEIGHT;
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: VIEW_HEIGHT, configurable: true });
}

/**
 * Thread harness: layout effect sets geometry before the hook's passive
 * effect runs, mirroring a real painted list.
 */
function Harness({ initialCount, resetKey }: { initialCount: number; resetKey?: unknown }) {
  const threadRef = useRef<HTMLDivElement | null>(null);
  const [count, setCount] = useState(initialCount);
  const { scrollToLatest } = useScrollToLatest(threadRef, count, resetKey);
  useLayoutEffect(() => {
    if (threadRef.current) geometry(threadRef.current, count);
  });
  return (
    <>
      <div ref={threadRef} data-testid="thread" style={{ overflowY: 'auto', height: VIEW_HEIGHT }}>
        {Array.from({ length: count }, (_, i) => (
          <p key={i}>message {i + 1}</p>
        ))}
      </div>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        add message
      </button>
      <button type="button" onClick={scrollToLatest}>
        jump
      </button>
    </>
  );
}

describe('useScrollToLatest', () => {
  beforeEach(() => {
    // Deterministic paint: frames run synchronously.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('jumps to the latest message when the thread opens', () => {
    render(<Harness initialCount={10} />);
    expect(screen.getByTestId('thread').scrollTop).toBe(10 * ITEM_HEIGHT);
  });

  it('follows new messages while the reader is near the bottom', () => {
    render(<Harness initialCount={10} resetKey="a" />);
    const thread = screen.getByTestId('thread');
    expect(thread.scrollTop).toBe(10 * ITEM_HEIGHT);

    // Another message arrives while pinned to the bottom.
    act(() => {
      screen.getByRole('button', { name: 'add message' }).click();
    });
    expect(thread.scrollTop).toBe(11 * ITEM_HEIGHT);
  });

  it('leaves the reader alone when they scrolled up into history', () => {
    render(<Harness initialCount={10} resetKey="a" />);
    const thread = screen.getByTestId('thread');
    expect(thread.scrollTop).toBe(10 * ITEM_HEIGHT);

    // Reader scrolls up past the stick threshold.
    thread.scrollTop = 10 * ITEM_HEIGHT - VIEW_HEIGHT - SCROLL_STICK_THRESHOLD_PX - 50;
    act(() => {
      screen.getByRole('button', { name: 'add message' }).click();
    });
    expect(thread.scrollTop).toBe(
      10 * ITEM_HEIGHT - VIEW_HEIGHT - SCROLL_STICK_THRESHOLD_PX - 50,
    );
  });

  it('explicit jumps always land on the latest message', () => {
    render(<Harness initialCount={10} resetKey="a" />);
    const thread = screen.getByTestId('thread');
    thread.scrollTop = 0;
    act(() => {
      screen.getByRole('button', { name: 'jump' }).click();
    });
    expect(thread.scrollTop).toBe(10 * ITEM_HEIGHT);
  });

  it('re-arms open-at-latest when the conversation changes', () => {
    // Same instance, new key, same item count: the new thread opens at its
    // latest message instead of inheriting the old scroll position.
    const { rerender } = render(<Harness initialCount={5} resetKey="a" />);
    const thread = screen.getByTestId('thread');
    expect(thread.scrollTop).toBe(5 * ITEM_HEIGHT);

    thread.scrollTop = 0;
    rerender(<Harness initialCount={5} resetKey="b" />);
    expect(thread.scrollTop).toBe(5 * ITEM_HEIGHT);
  });

  it('opens at the latest message on a fresh mount (keyed thread)', () => {
    const { unmount } = render(<Harness initialCount={5} resetKey="a" />);
    const first = screen.getByTestId('thread');
    expect(first.scrollTop).toBe(5 * ITEM_HEIGHT);

    unmount();
    render(<Harness initialCount={3} resetKey="b" />);
    expect(screen.getByTestId('thread').scrollTop).toBe(3 * ITEM_HEIGHT);
  });
});
