import { createContext } from 'react';

import type { MockUser } from './types';
import type { SessionStatus } from './types';

export interface MockSessionContextValue {
  status: SessionStatus;
  user: MockUser | null;
  role: MockUser['role'] | null;
  roleId: MockUser['roleId'];
  isQualified: boolean;
  loginAs: (user: MockUser) => void;
  logout: () => void;
}

export const MockSessionContext = createContext<MockSessionContextValue | null>(null);
