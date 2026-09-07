import { beforeAll } from 'vitest';

/**
 * jsdom has no `matchMedia`. Default to a non-matching stub so components using
 * `useMediaQuery` degrade to the mobile layout; tests override per-case.
 */
export function mockMatchMedia(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeAll(() => {
  mockMatchMedia(false);
});
