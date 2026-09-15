import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
const output = path.resolve('output/pages'); mkdirSync(output, { recursive: true });
let html = readFileSync('pages/index.html', 'utf8');
const value = process.env.CRM_PUBLIC_URL || '';
if (value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('CRM_PUBLIC_URL deve ser uma URL HTTPS sem credenciais, query ou fragmento.');
  const escaped = url.href.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  html = html.replace(/<!-- CRM_ACCESS -->[\s\S]*?<!-- \/CRM_ACCESS -->/, `<a href="${escaped}" rel="noreferrer">Entrar no CRM →</a><p>Use seu usuário e senha individuais para acessar o espaço da equipe.</p>`);
}
// Lista explícita: jamais copiar public/, data/, private/ ou a raiz do repositório.
writeFileSync(path.join(output, 'index.html'), html);
copyFileSync('pages/styles.css', path.join(output, 'styles.css'));
console.log('Portal público gerado: somente index.html e styles.css.');
