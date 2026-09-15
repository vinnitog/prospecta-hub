import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { problem } from './store.js';

const scrypt = promisify(scryptCallback);
const dummySalt = '00000000000000000000000000000000';
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw problem('Use uma senha entre 12 e 128 caracteres.');
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const valid = typeof password === 'string' && password.length <= 128;
  const [, salt, stored] = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(encoded || '') || [];
  const candidate = await scrypt(valid ? password : '', salt || dummySalt, 64);
  const expected = stored ? Buffer.from(stored, 'hex') : Buffer.alloc(64);
  return timingSafeEqual(candidate, expected) && valid && !!stored;
}
export function publicUser(user) { return { id: user.id, username: user.username, displayName: user.display_name, mustChangePassword: !!user.must_change_password }; }
