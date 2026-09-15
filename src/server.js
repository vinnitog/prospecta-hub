import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readConfig } from './config.js';
import { Store, STAGES, problem } from './store.js';
import { integrationStatus, receiveWebhook, safeEqual, sendMessage, verifyMetaSignature } from './whatsapp.js';
import { hashPassword, publicUser, verifyPassword } from './auth.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/styles.css', ['styles.css', 'text/css']]]);
const security = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
async function readBody(req, max = 1000000) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw problem('Envie JSON.', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw problem('Corpo da requisição muito grande.', 413); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function readJson(req) {
  try { return JSON.parse((await readBody(req)).toString('utf8')); }
  catch (error) { if (error.status) throw error; throw problem('JSON inválido.'); }
}
export function createApp(config, { store = new Store(config.dbPath), fetchImpl = fetch } = {}) {
  const sessions = new Map(); const attempts = new Map();
  function session(req) {
    const token = /(?:^|;\s*)prospecta_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    const value = sessions.get(token);
    const user = value && store.userById(value.userId);
    if (!value || value.expires < Date.now() || !user || user.password_version !== value.passwordVersion) { sessions.delete(token); return null; }
    return { ...value, user, token };
  }
  function newSession(res, user) {
    for (const [key, val] of sessions) if (val.expires < Date.now()) sessions.delete(key);
    if (sessions.size > 100) sessions.delete(sessions.keys().next().value);
    const token = randomBytes(32).toString('hex'); const csrf = randomBytes(24).toString('hex');
    sessions.set(token, { csrf, userId: user.id, passwordVersion: user.password_version, expires: Date.now() + 8 * 3600000 });
    res.setHeader('Set-Cookie', `prospecta_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${config.origin.startsWith('https:') ? '; Secure' : ''}`);
    return { csrf, user: publicUser(user) };
  }
  const server = http.createServer(async (req, res) => {
    const respond = (status, data, type = 'application/json') => { res.writeHead(status, { ...security, 'Content-Type': `${type}; charset=utf-8` }); res.end(type === 'application/json' ? JSON.stringify(data) : data); };
    try {
      const url = new URL(req.url, config.origin);
      // Host fixo impede DNS rebinding e acessos por origens não configuradas.
      if (req.headers.host !== new URL(config.origin).host) throw problem('Host não autorizado.', 403);
      if (url.pathname === '/api/whatsapp/webhook') {
        const state = integrationStatus(config.whatsapp);
        if (!state.ready) throw problem('Webhook externo inativo nesta configuração.', 503);
        if (req.method === 'GET') {
          if (url.searchParams.get('hub.mode') !== 'subscribe' || !safeEqual(url.searchParams.get('hub.verify_token'), config.whatsapp.verifyToken)) throw problem('Verificação recusada.', 403);
          return respond(200, url.searchParams.get('hub.challenge') || '', 'text/plain');
        }
        if (req.method !== 'POST') throw problem('Método não permitido.', 405);
        const raw = await readBody(req);
        if (!verifyMetaSignature(raw, req.headers['x-hub-signature-256'], config.whatsapp.appSecret)) throw problem('Assinatura inválida.', 401);
        let payload; try { payload = JSON.parse(raw); } catch { throw problem('JSON inválido.'); }
        return respond(200, receiveWebhook(store, config.whatsapp, payload));
      }
      if (req.headers.origin && req.headers.origin !== config.origin) throw problem('Origem não autorizada.', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw problem('Origem não autorizada.', 403);
      if (url.pathname === '/api/session') {
        if (req.method === 'GET') {
          const current = session(req);
          if (current) return respond(200, { csrf: current.csrf, user: publicUser(current.user) });
          return respond(401, { error: 'Entre com seu usuário e senha.' });
        }
        if (req.method === 'DELETE') {
          const current = session(req);
          if (!current || !safeEqual(req.headers['x-csrf-token'], current.csrf)) throw problem('Sessão inválida.', 403);
          sessions.delete(current.token);
          res.setHeader('Set-Cookie', `prospecta_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${config.origin.startsWith('https:') ? '; Secure' : ''}`);
          return respond(200, { ok: true });
        }
        if (req.method !== 'POST') throw problem('Método não permitido.', 405);
        const ip = req.socket.remoteAddress;
        for (const [key, val] of attempts) if (val.reset < Date.now()) attempts.delete(key);
        const limit = attempts.get(ip) || { count: 0, reset: Date.now() + 60000 };
        if (++limit.count > 10 || attempts.size > 1000) throw problem('Muitas tentativas. Aguarde um minuto.', 429);
        attempts.set(ip, limit);
        const input = await readJson(req);
        const username = typeof input?.username === 'string' ? input.username.trim().toLowerCase().slice(0, 40) : '';
        const user = store.user(username);
        if (!await verifyPassword(input?.password, user?.password_hash)) throw problem('Usuário ou senha inválidos.', 401);
        attempts.delete(ip); store.audit(user.id, 'login'); return respond(200, newSession(res, user));
      }
      if (assets.has(url.pathname) && req.method === 'GET') {
        const [file, type] = assets.get(url.pathname); return respond(200, await readFile(path.join(root, 'public', file)), type);
      }
      if (!url.pathname.startsWith('/api/')) throw problem('Página não encontrada.', 404);
      const current = session(req);
      if (!current) throw problem('Sessão expirada. Entre novamente.', 401);
      if (!['GET', 'HEAD'].includes(req.method) && !safeEqual(req.headers['x-csrf-token'], current.csrf)) throw problem('Sessão de formulário inválida. Recarregue a página.', 403);
      if (url.pathname === '/api/account/password' && req.method === 'POST') {
        const input = await readJson(req);
        if (!await verifyPassword(input?.currentPassword, current.user.password_hash)) throw problem('Senha atual inválida.', 403);
        if (input.newPassword === input.currentPassword) throw problem('Escolha uma senha diferente da inicial.');
        const hash = await hashPassword(input.newPassword);
        store.changePassword(current.user.id, hash);
        for (const [key, value] of sessions) if (value.userId === current.user.id) sessions.delete(key);
        store.audit(current.user.id, 'password_changed');
        return respond(200, newSession(res, store.userById(current.user.id)));
      }
      if (current.user.must_change_password) throw problem('Troque sua senha inicial para acessar os dados.', 403);
      if (!['GET', 'HEAD'].includes(req.method)) store.audit(current.user.id, req.method, url.pathname);
      if (url.pathname === '/api/state' && req.method === 'GET') return respond(200, { leads: store.list(), metrics: store.metrics(), stages: STAGES, integration: integrationStatus(config.whatsapp), templates: config.whatsapp.templates });
      if (url.pathname === '/api/leads' && req.method === 'POST') return respond(201, store.save(await readJson(req)));
      if (url.pathname === '/api/leads/import' && req.method === 'POST') return respond(200, store.import(await readJson(req)));
      if (url.pathname === '/api/leads/import-context' && req.method === 'POST') {
        let content;
        try { content = await readFile(config.contextPath, 'utf8'); } catch (error) { if (error.code === 'ENOENT') throw problem('Nenhum arquivo privado de leads configurado neste servidor. Use Importar JSON.', 404); throw error; }
        return respond(200, store.import(JSON.parse(content)));
      }
      if (url.pathname === '/api/export' && req.method === 'GET') {
        res.setHeader('Content-Disposition', 'attachment; filename="prospecta-export.json"');
        return respond(200, { exportedAt: new Date().toISOString(), leads: store.list(), messages: store.list().flatMap(l => store.messages(l.id)) });
      }
      const match = /^\/api\/leads\/([a-f0-9-]{36})(?:\/(messages|read|simulate))?$/.exec(url.pathname);
      if (!match) throw problem('Rota não encontrada.', 404);
      const [, id, action] = match; const lead = store.get(id);
      if (!lead) throw problem('Lead não encontrado.', 404);
      if (!action && req.method === 'PATCH') return respond(200, store.save(await readJson(req), id));
      if (action === 'messages' && req.method === 'GET') return respond(200, { messages: store.messages(id), lastInboundAt: store.lastInbound(id) });
      if (action === 'messages' && req.method === 'POST') return respond(200, await sendMessage(store, config.whatsapp, id, await readJson(req), fetchImpl));
      if (action === 'read' && req.method === 'POST') { store.read(id); return respond(200, { ok: true }); }
      if (action === 'simulate' && req.method === 'POST') {
        if (config.whatsapp.mode !== 'simulation') throw problem('Simulação indisponível em operação real.', 409);
        const input = await readJson(req);
        if (typeof input?.body !== 'string' || !input.body.trim() || input.body.length > 4096) throw problem('Mensagem inválida.');
        store.inbound(lead, { metaId: `simulation-${randomUUID()}`, body: input.body.trim() }, true);
        return respond(200, { ok: true });
      }
      throw problem('Método não permitido.', 405);
    } catch (error) {
      if (!res.headersSent) respond(error.status || 500, { error: error.status ? error.message : 'Não foi possível concluir a operação. Nenhum envio deve ser repetido sem conferir seu status.' });
    }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000;
  return { server, store };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = readConfig(); const { server, store } = createApp(config);
  server.listen(config.port, config.host, () => console.log(`Prospecta Hub: ${config.origin}\n${integrationStatus(config.whatsapp).message}`));
  const stop = () => server.close(() => { store.close(); process.exit(0); });
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
