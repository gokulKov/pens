const SESSION_TTL = 60 * 60 * 24 * 30;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/auth/start' && request.method === 'GET') return startLogin(url, env);
      if (url.pathname === '/auth/callback' && request.method === 'GET') return finishLogin(url, request, env);
      if (url.pathname === '/auth/logout' && request.method === 'POST') return logout(request, env);
      if (url.pathname === '/api/me' && request.method === 'GET') return me(request, env);
      if (url.pathname === '/api/diary' && request.method === 'GET') return getDiary(request, env);
      if (url.pathname === '/api/diary' && request.method === 'PUT') return putDiary(request, env);
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return json({ error: 'Not found' }, 404);
      return env.ASSETS.fetch(request);
    } catch {
      return json({ error: 'Request failed' }, 500);
    }
  }
};

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders } });
}
function randomToken(bytes = 32) {
  const array = new Uint8Array(bytes); crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function readCookie(request, name) {
  return (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1) || '';
}
function sessionCookie(value, maxAge = SESSION_TTL) {
  return `diary_session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
async function getSession(request, env) {
  const sid = readCookie(request, 'diary_session');
  if (!sid || sid.length > 100) return null;
  const stored = await env.DIARY_KV.get(`session:${sid}`);
  return stored ? { sid, ...JSON.parse(stored) } : null;
}
function jsonpBodyNotAllowed(request) { return request.headers.get('Content-Type') !== 'application/json'; }
function sameOrigin(request) { return request.headers.get('Origin') === new URL(request.url).origin; }
function needsCsrf(request, session) { return sameOrigin(request) && request.headers.get('X-Diary-CSRF') === session.csrf; }

async function startLogin(url, env) {
  const state = randomToken();
  await env.DIARY_KV.put(`oauth:${state}`, '1', { expirationTtl: 600 });
  const target = new URL('https://github.com/login/oauth/authorize');
  target.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  target.searchParams.set('redirect_uri', `${url.origin}/auth/callback`);
  target.searchParams.set('scope', 'read:user');
  target.searchParams.set('state', state);
  return new Response(null, { status: 302, headers: { Location: target.toString(), 'Cache-Control': 'no-store', 'Set-Cookie': `diary_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600` } });
}
async function finishLogin(url, request, env) {
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const stateValid = state && readCookie(request, 'diary_oauth_state') === state && await env.DIARY_KV.get(`oauth:${state}`);
  if (!stateValid || !code) return new Response('Sign-in could not be verified. Return to the diary and try again.', { status: 400 });
  await env.DIARY_KV.delete(`oauth:${state}`);
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${url.origin}/auth/callback`, state })
  });
  const token = await tokenResponse.json();
  if (!token.access_token) return new Response('GitHub sign-in failed. Return to the diary and try again.', { status: 401 });
  const profileResponse = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Dear-Diary' } });
  if (!profileResponse.ok) return new Response('Could not read your GitHub account.', { status: 401 });
  const profile = await profileResponse.json();
  if (!env.ALLOWED_GITHUB_LOGIN || profile.login.toLowerCase() !== env.ALLOWED_GITHUB_LOGIN.toLowerCase()) return new Response('This diary is configured for a different GitHub account.', { status: 403 });
  const sid = randomToken(), csrf = randomToken();
  await env.DIARY_KV.put(`session:${sid}`, JSON.stringify({ uid: String(profile.id), login: profile.login, csrf }), { expirationTtl: SESSION_TTL });
  const headers = new Headers({ Location: `${url.origin}/?signed_in=1`, 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', sessionCookie(sid));
  headers.append('Set-Cookie', 'diary_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  return new Response(null, { status: 302, headers });
}
async function me(request, env) {
  const session = await getSession(request, env);
  return json(session ? { signedIn: true, login: session.login, csrf: session.csrf } : { signedIn: false });
}
async function getDiary(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'Sign in again to continue.' }, 401);
  const value = await env.DIARY_KV.get(`diary:${session.uid}`);
  return json({ backup: value ? JSON.parse(value) : null });
}
async function putDiary(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'Sign in again to continue.' }, 401);
  if (!needsCsrf(request, session)) return json({ error: 'Request could not be verified.' }, 403);
  if (jsonpBodyNotAllowed(request)) return json({ error: 'Backup request must be JSON.' }, 415);
  const input = await request.json().catch(() => null);
  if (!input || input.version !== 1 || typeof input.ciphertext !== 'string' || typeof input.salt !== 'string' || typeof input.iv !== 'string' || input.ciphertext.length > 2_000_000) return json({ error: 'Backup is invalid or too large.' }, 400);
  const record = { version: 1, ciphertext: input.ciphertext, salt: input.salt, iv: input.iv, updatedAt: new Date().toISOString() };
  await env.DIARY_KV.put(`diary:${session.uid}`, JSON.stringify(record));
  return json({ saved: true, updatedAt: record.updatedAt });
}
async function logout(request, env) {
  const session = await getSession(request, env);
  if (!session) return json({ signedIn: false }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  if (!needsCsrf(request, session)) return json({ error: 'Request could not be verified.' }, 403);
  await env.DIARY_KV.delete(`session:${session.sid}`);
  return json({ signedIn: false }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
