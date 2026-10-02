import { describe, expect, it } from 'vitest';

import { createContentItemRequestSchema, validateContentTitle } from './content';

const BASE = {
  title: 'JA&D Project Showcase',
  kind: 'IMAGE' as const,
  downloadUrl: 'https://cdn.test/showcase.jpg',
};

describe('validateContentTitle', () => {
  it('accepts a normal title', () => {
    expect(validateContentTitle('JA&D Project Showcase')).toBeNull();
  });

  it('rejects empty and whitespace-only titles', () => {
    expect(validateContentTitle('')).not.toBeNull();
    expect(validateContentTitle('   ')).not.toBeNull();
  });

  it('rejects titles shorter than 3 characters', () => {
    expect(validateContentTitle('ab')).not.toBeNull();
  });

  it('rejects titles longer than 120 characters', () => {
    expect(validateContentTitle('a'.repeat(121))).not.toBeNull();
  });

  it('rejects titles with no letters or numbers', () => {
    expect(validateContentTitle('!!!')).not.toBeNull();
    expect(validateContentTitle('---')).not.toBeNull();
  });

  it('rejects control characters', () => {
    expect(validateContentTitle('Show\x00case')).not.toBeNull();
    expect(validateContentTitle('Show\x1Fcase')).not.toBeNull();
  });
});

describe('createContentItemRequestSchema title', () => {
  it('accepts a valid title', () => {
    expect(createContentItemRequestSchema.safeParse(BASE).success).toBe(true);
  });

  it.each(['', '   ', 'ab', '!!!', 'a'.repeat(121)])(
    'rejects invalid title %s',
    (title) => {
      expect(createContentItemRequestSchema.safeParse({ ...BASE, title }).success).toBe(false);
    },
  );
});
