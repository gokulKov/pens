import { getSession, json, needsCsrf } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'Sign in again to continue.' }, 401);
  const value = await env.DIARY_KV.get(`diary:${session.uid}`);
  return json({ backup: value ? JSON.parse(value) : null });
}

export async function onRequestPut({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'Sign in again to continue.' }, 401);
  if (!needsCsrf(request, session)) return json({ error: 'Request could not be verified.' }, 403);
  const input = await request.json().catch(() => null);
  if (!input || input.version !== 1 || typeof input.ciphertext !== 'string' || typeof input.salt !== 'string' || typeof input.iv !== 'string' || input.ciphertext.length > 2_000_000) {
    return json({ error: 'Backup is invalid or too large.' }, 400);
  }
  const record = { version: 1, ciphertext: input.ciphertext, salt: input.salt, iv: input.iv, updatedAt: new Date().toISOString() };
  await env.DIARY_KV.put(`diary:${session.uid}`, JSON.stringify(record));
  return json({ saved: true, updatedAt: record.updatedAt });
}
