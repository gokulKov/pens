import { getSession, json, needsCsrf, sessionCookie } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return json({ signedIn: false }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  if (!needsCsrf(request, session)) return json({ error: 'Request could not be verified.' }, 403);
  await env.DIARY_KV.delete(`session:${session.sid}`);
  return json({ signedIn: false }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
