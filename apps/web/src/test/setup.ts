import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Generous async timeout: the full suite runs files in parallel and heavy
// pages (multi-step form, galleries) can exceed the 1s default under load.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try {
    localStorage.removeItem('jad:mock:session');
  } catch {
    // storage unavailable
  }
  try {
    sessionStorage.removeItem('jad:register:draft:v1');
    sessionStorage.removeItem('jad:register:email');
    sessionStorage.removeItem('jad:register:draft');
  } catch {
    // storage unavailable
  }
});
