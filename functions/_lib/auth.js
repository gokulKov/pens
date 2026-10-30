export const SESSION_TTL = 60 * 60 * 24 * 30;
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}
export function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes); crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export function readCookie(request, name) {
  return (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1) || '';
}
export function sessionCookie(value, maxAge = SESSION_TTL) {
  return `diary_session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
export async function getSession(request, env) {
  const sid = readCookie(request, 'diary_session');
  if (!sid || sid.length > 100) return null;
  const data = await env.DIARY_KV.get(`session:${sid}`);
  return data ? { sid, ...JSON.parse(data) } : null;
}
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !!origin && origin === new URL(request.url).origin;
}
export function needsCsrf(request, session) {
  return sameOrigin(request) && request.headers.get('X-Diary-CSRF') === session.csrf;
}
