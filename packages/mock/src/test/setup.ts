import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  try {
    localStorage.removeItem('jad:mock:session');
  } catch {
    // storage unavailable
  }
});
