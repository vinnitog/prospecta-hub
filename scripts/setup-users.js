import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { hashPassword } from '../src/auth.js';

const config = readConfig(); const store = new Store(config.dbPath);
const usernames = process.argv.slice(2);
if (usernames.length !== 2 || usernames[0] === usernames[1] || usernames.some(name => !/^[a-z0-9._-]{3,40}$/.test(name))) {
  console.error('Uso: npm.cmd run setup:users -- usuario1 usuario2 (nomes distintos, 3–40 caracteres).');
  store.close(); process.exit(1);
}
try {
  if (usernames.some(name => store.user(name))) throw new Error('Uma dessas contas já existe. O script não sobrescreve acessos.');
  const records = await Promise.all(usernames.map(async username => { const password = randomBytes(18).toString('base64url'); return { username, password, hash: await hashPassword(password) }; }));
  const folder = path.resolve('private'); mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `acessos-iniciais-${Date.now()}.txt`);
  // Nunca imprimir senhas: arquivo local excluído do Git, a ser removido após a troca inicial.
  writeFileSync(file, `Prospecta Hub — acessos iniciais privados\n${config.origin}\n\n${records.map(r => `Usuário: ${r.username}\nSenha inicial: ${r.password}\n`).join('\n')}\nCada conta deve trocar a senha no primeiro login. Compartilhe a senha do sócio por um canal privado.\n`, { flag: 'wx', mode: 0o600 });
  store.transaction(() => records.forEach(r => store.createUser(r.username, r.username, r.hash)));
  console.log(`Duas contas criadas. Senhas iniciais somente no arquivo local: ${file}`);
} finally { store.close(); }
