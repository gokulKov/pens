import { getSession, json } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  return json(session ? { signedIn: true, login: session.login, csrf: session.csrf } : { signedIn: false });
}
