import { describe, expect, it, vi } from 'vitest';

import {
  GOVERNMENT_ID_MAX_BYTES,
  safeDocumentName,
  signGovernmentIdUrl,
  stripDocumentData,
  uploadGovernmentId,
  validateDocumentUpload,
} from './documents.js';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('validateDocumentUpload', () => {
  it('accepts images and PDFs within the cap', () => {
    for (const mimeType of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
      const result = validateDocumentUpload({ fileName: 'id.pdf', mimeType, data: PNG_DATA_URL });
      expect(result).toMatchObject({ ok: true, mimeType });
    }
  });

  it('rejects disallowed types, missing data, and oversize payloads', () => {
    expect(
      validateDocumentUpload({
        fileName: 'id.exe',
        mimeType: 'application/x-msdownload',
        data: PNG_DATA_URL,
      }),
    ).toMatchObject({
      ok: false,
    });
    expect(validateDocumentUpload({ fileName: 'id.png', mimeType: 'image/png' })).toMatchObject({
      ok: false,
      message: 'Government ID file data is missing.',
    });
    expect(
      validateDocumentUpload({ fileName: 'id.png', mimeType: 'image/png', data: 'data:, ' }),
    ).toMatchObject({ ok: false, message: 'Government ID file data is invalid.' });
    // ~4.2 MB encoded → ~3.1 MB decoded: over the 3 MB cap.
    const big = `data:image/png;base64,${'A'.repeat(4400000)}`;
    expect(
      validateDocumentUpload({ fileName: 'id.png', mimeType: 'image/png', data: big }),
    ).toMatchObject({
      ok: false,
      message: 'Government ID must be 3 MB or less.',
    });
  });
});

describe('safeDocumentName', () => {
  it('sanitizes and falls back', () => {
    expect(safeDocumentName('../../etc/passwd')).not.toContain('/');
    expect(safeDocumentName('')).toBe('document');
  });
});

describe('stripDocumentData', () => {
  it('drops upload bytes but keeps metadata', () => {
    expect(stripDocumentData({ fileName: 'a.pdf', data: 'bytes', storagePath: 'k' })).toEqual({
      fileName: 'a.pdf',
      storagePath: 'k',
    });
    expect(stripDocumentData(null)).toBeNull();
  });
});

describe('uploadGovernmentId / signGovernmentIdUrl', () => {
  function storageStub(uploads: unknown[], signedUrl = 'https://signed.test/doc') {
    return {
      storage: {
        from: () => ({
          upload: async (...args: unknown[]) => {
            uploads.push(args);
            return { error: null };
          },
          createSignedUrl: async () => ({ data: { signedUrl }, error: null }),
        }),
      },
    };
  }

  it('uploads under the registration prefix without upsert', async () => {
    const uploads: unknown[] = [];
    const result = await uploadGovernmentId(storageStub(uploads), 'reg-1', {
      fileName: 'my id.pdf',
      mimeType: 'image/png',
      data: PNG_DATA_URL,
    });
    expect(result).toMatchObject({ ok: true });
    const [key, , options] = uploads[0] as [string, unknown, { upsert: boolean }];
    expect(key.startsWith('reg-1/')).toBe(true);
    expect(options.upsert).toBe(false);
    if (result.ok) expect(result.storagePath).toBe(key);
  });

  it('surfaces storage failures', async () => {
    const failing = {
      storage: {
        from: () => ({
          upload: async () => ({ error: { message: 'bucket missing' } }),
          createSignedUrl: async () => ({ data: null, error: { message: 'nope' } }),
        }),
      },
    };
    await expect(
      uploadGovernmentId(failing, 'reg-1', {
        fileName: 'a.png',
        mimeType: 'image/png',
        data: PNG_DATA_URL,
      }),
    ).resolves.toMatchObject({ ok: false, message: 'bucket missing' });
    await expect(signGovernmentIdUrl(failing, 'k')).resolves.toMatchObject({ ok: false });
  });

  it('mints viewer URLs', async () => {
    const uploads: unknown[] = [];
    await expect(signGovernmentIdUrl(storageStub(uploads), 'reg-1/a.png')).resolves.toMatchObject({
      ok: true,
      url: 'https://signed.test/doc',
    });
  });
});
