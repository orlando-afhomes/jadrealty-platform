import { useContext } from 'react';

import { MockSessionContext } from './MockSessionContext';
import type { MockSessionContextValue } from './MockSessionContext';

export function useMockSession(): MockSessionContextValue {
  const ctx = useContext(MockSessionContext);
  if (!ctx) {
    throw new Error('useMockSession must be used within a MockSessionProvider');
  }
  return ctx;
}
