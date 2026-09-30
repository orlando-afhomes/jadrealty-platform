import { describe, expect, it } from 'vitest';

import { validateLogin } from './validation';

describe('validateLogin', () => {
  it('requires an identifier and a password', () => {
    expect(validateLogin({ identifier: '', password: '' })).toEqual({
      identifier: 'Enter your email address.',
      password: 'Enter your password.',
    });
  });

  it('accepts an email identifier', () => {
    expect(validateLogin({ identifier: 'maria@example.com', password: 'x' })).toEqual({});
  });

  it('accepts a padded email identifier (trimmed before submit)', () => {
    expect(validateLogin({ identifier: '  maria@example.com  ', password: 'x' })).toEqual({});
  });

  it('rejects a phone identifier (email-only login)', () => {
    expect(validateLogin({ identifier: '+639171234567', password: 'x' })).toEqual({
      identifier: 'Enter a valid email address.',
    });
  });

  it('rejects a malformed email identifier', () => {
    expect(validateLogin({ identifier: 'maria@', password: 'x' })).toEqual({
      identifier: 'Enter a valid email address.',
    });
  });

  it('rejects an overlong identifier', () => {
    expect(
      validateLogin({ identifier: `${'a'.repeat(250)}@example.com`, password: 'x' }),
    ).toEqual({ identifier: 'Enter a valid email address.' });
  });
});
