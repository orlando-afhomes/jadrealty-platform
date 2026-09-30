import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

function css(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

/**
 * Visited-label guards: the global `a:visited` rule (specificity 0,1,1)
 * beats single-class button rules (0,1,0) and repaints white labels brand
 * blue on brand surfaces (live incident: register/status sign-in button
 * unreadable after visiting /login). Each brand-surface link style keeps an
 * explicit `:visited` guard - this spec fails if one is removed.
 */
describe('visited-label guards', () => {
  it('keeps the register/status sign-in label white when visited', () => {
    expect(css('./RegistrationStatusPage.module.css')).toMatch(
      /\.signInLink:visited\s*\{[^}]*color:\s*var\(--color-text-on-brand\)/,
    );
  });

  it('keeps the featured contact-method icon white when visited', () => {
    expect(css('../../public/pages/ContactPage.module.css')).toMatch(
      /\.methodLink:visited\s+\.methodIconFeatured\s*\{[^}]*color:\s*var\(--color-text-on-brand\)/,
    );
  });
});
