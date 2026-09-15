import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const blocked = paths.filter(file => /^(data|private|backups|output)\//.test(file) || /(^|\/)\.env(\.|$)/.test(file) && !file.endsWith('.env.example') || /\.(sqlite|db)(-|$)|\.pem$|acessos-iniciais|export.*\.json$/i.test(file));
for (const file of paths.filter(p => /\.(js|json|html|md|ya?ml|css|example)$/.test(p))) {
  const text = readFileSync(file, 'utf8');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bEA[A-Za-z0-9]{100,}|scrypt:[a-f0-9]{32}:[a-f0-9]{128}/.test(text)) blocked.push(file);
}
if (blocked.length) { console.error(`Arquivos proibidos para publicação: ${[...new Set(blocked)].join(', ')}`); process.exit(1); }
console.log(`Auditoria de publicação: ${paths.length} arquivos rastreados; nenhum arquivo privado ou segredo conhecido detectado.`);
