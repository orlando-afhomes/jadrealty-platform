import { createClient } from '@supabase/supabase-js';

import { ADMIN_STAFF } from '../../../_lib/access.js';
import { verifyStaff } from '../../../_lib/auth.js';
import { getSupabaseEnv } from '../../../_lib/env.js';
import { toErrorEnvelope as toError } from '../../../_lib/envelope.js';
import type { VercelRequest, VercelResponse } from '../../../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', (req.headers.origin as string) ?? '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    const { error, status } = toError('NOT_FOUND', `Method ${req.method} not allowed`, 405);
    res.status(status).json({ error });
    return;
  }
  const auth = await verifyStaff(req, [...ADMIN_STAFF]);
  if ('error' in auth) {
    const { error, status } = auth.error;
    res.status(status).json({ error });
    return;
  }
  const { url, serviceKey } = getSupabaseEnv();
  if (!url || !serviceKey) {
    const { error, status } = toError('INTERNAL', 'Supabase not configured', 500);
    res.status(status).json({ error });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object') {
    const { error, status } = toError('VALIDATION_ERROR', 'Missing request body', 400);
    res.status(status).json({ error });
    return;
  }

  const fileName = (body.name as string | undefined)?.trim() ?? '';
  const mimeType = (body.type as string | undefined)?.trim() ?? '';
  const size = body.size as number | undefined;

  if (!fileName) {
    const { error, status } = toError('VALIDATION_ERROR', 'File name is required', 400);
    res.status(status).json({ error });
    return;
  }
  if (!mimeType) {
    const { error, status } = toError('VALIDATION_ERROR', 'File type is required', 400);
    res.status(status).json({ error });
    return;
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const validExts = ['jpg', 'jpeg', 'png', 'webp'];
  const typeOk = validTypes.includes(mimeType) || validExts.includes(ext);
  if (!typeOk) {
    const { error, status } = toError('VALIDATION_ERROR', 'Only JPG, PNG and WebP are allowed', 400);
    res.status(status).json({ error });
    return;
  }

  if (typeof size === 'number' && size > 20 * 1024 * 1024) {
    const { error, status } = toError('VALIDATION_ERROR', 'File must be 20 MB or less', 400);
    res.status(status).json({ error });
    return;
  }

  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false } });
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'image';
  const key = `cms/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const { data, error } = await supabase.storage.from('marketing-tools').createSignedUploadUrl(key);

  if (error || !data) {
    const { error: err, status } = toError('INTERNAL', error?.message ?? 'Failed to create signed upload URL', 500);
    res.status(status).json({ error: err });
    return;
  }

  const { data: pub } = supabase.storage.from('marketing-tools').getPublicUrl(key);

  res.status(200).json({
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path,
    key,
    publicUrl: pub.publicUrl,
  });
}
