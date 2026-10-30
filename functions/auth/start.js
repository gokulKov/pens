import { randomToken } from '../_lib/auth.js';

export async function onRequest({ request, env }) {
  const state = randomToken();
  await env.DIARY_KV.put(`oauth:${state}`, '1', { expirationTtl: 600 });
  const origin = new URL(request.url).origin;
  const callback = `${origin}/auth/callback`;
  const target = new URL('https://github.com/login/oauth/authorize');
  target.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  target.searchParams.set('redirect_uri', callback);
  target.searchParams.set('scope', 'read:user');
  target.searchParams.set('state', state);
  const headers = new Headers({ Location: target.toString(), 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', `diary_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  return new Response(null, { status: 302, headers });
}
