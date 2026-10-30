import { randomToken, readCookie, sessionCookie, SESSION_TTL } from '../_lib/auth.js';

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const origin = url.origin;
  const stateValid = state && readCookie(request, 'diary_oauth_state') === state && await env.DIARY_KV.get(`oauth:${state}`);
  if (!stateValid || !code) return new Response('Sign-in could not be verified. Return to the diary and try again.', { status: 400 });
  await env.DIARY_KV.delete(`oauth:${state}`);
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${origin}/auth/callback`, state })
  });
  const token = await tokenResponse.json();
  if (!token.access_token) return new Response('GitHub sign-in failed. Return to the diary and try again.', { status: 401 });
  const profileResponse = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Dear-Diary' } });
  if (!profileResponse.ok) return new Response('Could not read your GitHub account.', { status: 401 });
  const profile = await profileResponse.json();
  if (!env.ALLOWED_GITHUB_LOGIN || profile.login.toLowerCase() !== env.ALLOWED_GITHUB_LOGIN.toLowerCase()) {
    return new Response('This diary is configured for a different GitHub account.', { status: 403 });
  }
  const sid = randomToken();
  const csrf = randomToken();
  await env.DIARY_KV.put(`session:${sid}`, JSON.stringify({ uid: String(profile.id), login: profile.login, csrf }), { expirationTtl: SESSION_TTL });
  const headers = new Headers({ Location: `${origin}/?signed_in=1`, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', sessionCookie(sid));
  headers.append('Set-Cookie', 'diary_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  return new Response(null, { status: 302, headers });
}
