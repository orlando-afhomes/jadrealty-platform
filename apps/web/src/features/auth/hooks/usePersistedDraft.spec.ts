import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { usePersistedDraft } from './usePersistedDraft';

const STORAGE_KEY = 'jad:register:draft:v2';

describe('usePersistedDraft credential hygiene', () => {
  beforeEach(() => {
    sessionStorage.removeItem(STORAGE_KEY);
  });

  it('never persists passwords to sessionStorage', () => {
    const { result } = renderHook(() => usePersistedDraft('create'));
    act(() => {
      result.current[1]((draft) => ({
        ...draft,
        firstName: 'Ana',
        password: 'S3cret12',
        confirmPassword: 'S3cret12',
      }));
    });

    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Record<string, unknown>;
    expect(parsed['firstName']).toBe('Ana');
    expect(parsed).not.toHaveProperty('password');
    expect(parsed).not.toHaveProperty('confirmPassword');
  });

  it('strips passwords from a tampered stored draft on restore', () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ firstName: 'Ana', password: 'S3cret12', confirmPassword: 'S3cret12' }),
    );
    const { result } = renderHook(() => usePersistedDraft('create'));
    expect(result.current[0].firstName).toBe('Ana');
    expect(result.current[0].password).toBe('');
    expect(result.current[0].confirmPassword).toBe('');
  });
});
