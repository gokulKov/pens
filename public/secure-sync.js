const $ = (id) => document.getElementById(id);
const dialog = $('syncDialog');
const state = $('syncState');
const localKey = 'dear-diary-v2';
let csrf = '';
let signedIn = false;

if (location.hostname.endsWith('github.io')) {
  $('syncOpen').hidden = true;
} else {

const say = (message, bad = false) => { state.textContent = message; state.style.color = bad ? '#a04335' : ''; };
async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set('Content-Type', 'application/json');
  if (options.method === 'PUT' || options.method === 'POST') headers.set('X-Diary-CSRF', csrf);
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  const result = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not reach secure storage.');
  return result;
}
function refreshAccount(result) {
  signedIn = !!result.signedIn;
  csrf = result.csrf || '';
  $('signedOutActions').hidden = signedIn;
  $('signedInActions').hidden = !signedIn;
  $('githubIdentity').textContent = signedIn ? `Signed in as @${result.login}. Diary data is encrypted before upload.` : '';
}
async function checkAccount() {
  try { refreshAccount(await api('/api/me')); }
  catch { refreshAccount({ signedIn: false }); say('Secure backup is not connected yet. Finish the setup steps first.'); }
}
function bytesToBase64(bytes) { let binary = ''; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary); }
function base64ToBytes(value) { return Uint8Array.from(atob(value), ch => ch.charCodeAt(0)); }
async function deriveKey(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptBackup(passphrase, value) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const clear = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, clear);
  return { version: 1, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(cipher)) };
}
async function decryptBackup(passphrase, record) {
  if (!record || record.version !== 1) throw new Error('This backup version is not supported.');
  const key = await deriveKey(passphrase, base64ToBytes(record.salt));
  let clear;
  try { clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(record.iv) }, key, base64ToBytes(record.ciphertext)); }
  catch { throw new Error('That password did not unlock this backup. Check it and try again.'); }
  const value = JSON.parse(new TextDecoder().decode(clear));
  if (!value || typeof value !== 'object' || !value.entries || typeof value.entries !== 'object') throw new Error('The decrypted diary file is not valid.');
  return value;
}
function passphrase() {
  const value = $('diaryPassphrase').value;
  if (value.length < 12) throw new Error('Use a diary password with at least 12 characters.');
  return value;
}
function setBusy(busy) { $('uploadBackup').disabled = busy; $('restoreBackup').disabled = busy; $('githubSignIn').disabled = busy; }

$('syncOpen').addEventListener('click', async () => { dialog.showModal(); say('Checking GitHub sign-in…'); await checkAccount(); });
$('syncClose').addEventListener('click', () => dialog.close());
$('githubSignIn').addEventListener('click', () => { location.href = '/auth/start'; });
$('uploadBackup').addEventListener('click', async () => {
  setBusy(true);
  try {
    const secret = passphrase();
    const raw = localStorage.getItem(localKey);
    if (!raw) throw new Error('No diary is saved on this device yet.');
    const current = await api('/api/diary');
    if (current.backup && !confirm('Replace the encrypted backup already saved for this GitHub account?')) return;
    const value = JSON.parse(raw);
    const sealed = await encryptBackup(secret, value);
    await api('/api/diary', { method: 'PUT', body: JSON.stringify(sealed) });
    $('diaryPassphrase').value = '';
    say('Encrypted backup saved. You can restore it after signing in on another device.');
  } catch (error) { say(error.message || 'Backup failed.', true); }
  finally { setBusy(false); }
});
$('restoreBackup').addEventListener('click', async () => {
  setBusy(true);
  try {
    const secret = passphrase();
    const result = await api('/api/diary');
    if (!result.backup) throw new Error('There is no cloud backup for this GitHub account yet.');
    const value = await decryptBackup(secret, result.backup);
    const existing = localStorage.getItem(localKey);
    if (existing && !confirm('Restore this backup over the diary currently saved on this device?')) return;
    localStorage.setItem(localKey, JSON.stringify(value));
    $('diaryPassphrase').value = '';
    say('Diary restored on this device. Reloading…');
    setTimeout(() => location.reload(), 700);
  } catch (error) { say(error.message || 'Restore failed.', true); }
  finally { setBusy(false); }
});
$('signOut').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST', body: '{}' }); refreshAccount({ signedIn: false }); say('Signed out. Your diary remains on this device.'); }
  catch (error) { say(error.message, true); }
});

checkAccount().then(() => {
  if (new URLSearchParams(location.search).has('signed_in')) {
    history.replaceState(null, '', location.pathname);
    dialog.showModal();
    say(signedIn ? 'GitHub sign-in is ready. Set an encryption password before creating your backup.' : 'GitHub sign-in did not finish. Please try again.', !signedIn);
  }
});
}
