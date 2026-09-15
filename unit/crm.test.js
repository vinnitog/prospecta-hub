import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Store } from '../src/store.js';
import { hashPassword } from '../src/auth.js';
const testPassword = 'senha-ficticia-de-qa-123';
const testHash = await hashPassword(testPassword);
import { readConfig } from '../src/config.js';
import { createApp } from '../src/server.js';
import { receiveWebhook, sendMessage, verifyMetaSignature, integrationStatus } from '../src/whatsapp.js';

const leadData = { company: 'Empresa Fictícia QA', phone: '5511000000001', segment: 'Teste', city: 'Cidade de teste', score: 9 };
const live = { mode: 'live', topology: 'dedicated', accessToken: 'token-ficticio', phoneNumberId: '1111111111', protectedPhoneNumberId: '2222222222', appSecret: 'secret-ficticio', verifyToken: 'verify-ficticio', apiVersion: 'v25.0', templates: ['qa_template'], templateLanguage: 'pt_BR' };
const input = (body = 'Mensagem fictícia') => ({ requestKey: randomUUID(), body });
const event = (messages, phoneId = live.phoneNumberId, statuses = []) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: phoneId }, messages, statuses } }] }] });
const inbound = (id = randomUUID(), extra = {}) => ({ id, from: leadData.phone, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Quero conhecer o produto.' }, ...extra });
function setup(t) { const store = new Store(); t.after(() => store.close()); const lead = store.save(leadData); return { store, lead }; }
function consent(store, lead) { store.save({ optIn: true, optInEvidence: 'Autorização fictícia para teste automatizado.' }, lead.id); }

test('cadastro valida score, deduplica telefone com máscara e preserva identidade', t => {
  const { store, lead } = setup(t);
  assert.throws(() => store.save({ ...leadData, score: 11 }), /Score/);
  assert.throws(() => store.save({ ...leadData, phone: '+55 (11) 00000-0001' }), /Já existe/);
  assert.throws(() => store.save({ phone: '5511000000002' }, lead.id), /identidade/);
  assert.throws(() => store.save({ optIn: true }, lead.id), /evidência/);
  assert.equal(store.save({ stage: 'Interessado', tags: ['teste'], notes: 'Revisar necessidades.' }, lead.id).stage, 'Interessado');
});
test('importação é atômica e duplicatas não sobrescrevem dados', t => {
  const { store, lead } = setup(t);
  assert.throws(() => store.import([{ ...leadData, phone: '5511000000002' }, { company: 'inválido' }]), /Telefone/);
  assert.equal(store.list().length, 1);
  assert.deepEqual(store.import([{ ...leadData, company: 'Não deve sobrescrever' }]), { imported: 0, skipped: 1 });
  assert.equal(store.get(lead.id).company, leadData.company);
});
test('assinatura exige corpo original, segredo e hash válido', () => {
  const raw = Buffer.from('{"event":1}'); const sig = 'sha256=' + createHmac('sha256', live.appSecret).update(raw).digest('hex');
  assert.equal(verifyMetaSignature(raw, sig, live.appSecret), true);
  assert.equal(verifyMetaSignature(Buffer.from('{}'), sig, live.appSecret), false);
  assert.equal(verifyMetaSignature(raw, 'sha256=abc', live.appSecret), false);
  assert.equal(verifyMetaSignature(raw, sig, ''), false);
});
test('número compartilhado e ID protegido bloqueiam envios mesmo com credenciais', async t => {
  const { store, lead } = setup(t); let calls = 0; const fake = () => { calls++; };
  for (const config of [{ ...live, topology: 'shared' }, { ...live, phoneNumberId: live.protectedPhoneNumberId }, { ...live, protectedPhoneNumberId: '' }]) {
    assert.equal(integrationStatus(config).ready, false);
    await assert.rejects(sendMessage(store, config, lead.id, input(), fake));
  }
  assert.equal(calls, 0); assert.equal(store.messages(lead.id).length, 0);
});
test('simulação nunca usa rede, não muda etapa e não conta nas métricas reais', async t => {
  const { store, lead } = setup(t);
  const sent = await sendMessage(store, { mode: 'simulation' }, lead.id, input(), () => { throw new Error('Rede proibida'); });
  store.inbound(lead, { body: 'Resposta fictícia' }, true);
  assert.equal(sent.status, 'simulated'); assert.equal(store.get(lead.id).stage, 'Não contatado');
  assert.equal(store.metrics().contacted, 0); assert.equal(store.metrics().replied, 0); assert.equal(store.lastInbound(lead.id), null);
});
test('webhook ignora outro remetente e contatos desconhecidos em lote misto', t => {
  const { store, lead } = setup(t);
  assert.equal(receiveWebhook(store, live, event([inbound()], '9999999999')).accepted, 0);
  const result = receiveWebhook(store, live, event([inbound(), inbound(randomUUID(), { from: '5511000000002' })]));
  assert.equal(result.accepted, 1); assert.equal(result.ignored, 1); assert.equal(store.list().length, 1);
  assert.equal(store.messages(lead.id).length, 1);
});
test('webhook deduplica e conserva janela baseada no timestamp original', t => {
  const { store, lead } = setup(t); const msg = inbound('wamid-duplicate', { timestamp: String(Math.floor(Date.now() / 1000) - 90000) });
  receiveWebhook(store, live, event([msg, msg])); receiveWebhook(store, live, event([msg]));
  assert.equal(store.messages(lead.id).length, 1); assert.equal(store.get(lead.id).unread, 1);
  assert.ok(store.lastInbound(lead.id) < Date.now() - 86400000);
  store.read(lead.id); assert.equal(store.get(lead.id).unread, 0);
});
test('eventos com timestamp futuro não abrem janela de resposta', t => {
  const { store, lead } = setup(t);
  receiveWebhook(store, live, event([inbound('future', { timestamp: String(Math.floor(Date.now() / 1000) + 120) })]));
  assert.equal(store.messages(lead.id).length, 0);
});
test('texto livre exige autorização e janela real de 24h; simulação não abre janela', async t => {
  const { store, lead } = setup(t);
  await assert.rejects(sendMessage(store, live, lead.id, input()), /autorização/);
  consent(store, lead); store.inbound(lead, { body: 'Fictício' }, true);
  await assert.rejects(sendMessage(store, live, lead.id, input()), /24 horas/);
});
test('requisição de envio usa payload Meta e chave idempotente contra cliques duplicados', async t => {
  const { store, lead } = setup(t); consent(store, lead); receiveWebhook(store, live, event([inbound()]));
  let calls = 0; let payload;
  const fake = async (url, options) => { calls++; assert.equal(url, 'https://graph.facebook.com/v25.0/1111111111/messages'); payload = JSON.parse(options.body); return Response.json({ messages: [{ id: 'wamid-out' }] }); };
  const request = input(); const first = await sendMessage(store, live, lead.id, request, fake); const second = await sendMessage(store, live, lead.id, request, fake);
  assert.equal(calls, 1); assert.equal(first.id, second.id); assert.equal(payload.to, leadData.phone); assert.equal(payload.text.body, request.body);
  assert.equal(first.status, 'accepted'); assert.equal(store.metrics().contacted, 1);
  await assert.rejects(sendMessage(store, live, lead.id, { ...request, body: 'Diferente' }, fake), /Identificador/);
});
test('template aprovado inicia contato fora da janela; template não listado é recusado', async t => {
  const { store, lead } = setup(t); consent(store, lead);
  await assert.rejects(sendMessage(store, live, lead.id, { ...input('desconhecido'), kind: 'template' }), /Template/);
  const result = await sendMessage(store, live, lead.id, { ...input('qa_template'), kind: 'template' }, async (_, options) => {
    assert.deepEqual(JSON.parse(options.body).template, { name: 'qa_template', language: { code: 'pt_BR' } });
    return Response.json({ messages: [{ id: 'wamid-template' }] });
  });
  assert.equal(result.status, 'accepted'); assert.equal(store.get(lead.id).stage, 'Mensagem enviada');
});
test('status fora de ordem e anterior ao retorno de envio é reconciliado sem regressão', async t => {
  const { store, lead } = setup(t); consent(store, lead); receiveWebhook(store, live, event([inbound()]));
  const timestamp = Date.now();
  const result = await sendMessage(store, live, lead.id, input(), async () => {
    store.delivery({ id: 'wamid-fast', recipient: lead.phone, status: 'read', timestamp });
    return Response.json({ messages: [{ id: 'wamid-fast' }] });
  });
  assert.equal(result.status, 'read');
  store.delivery({ id: 'wamid-fast', recipient: lead.phone, status: 'sent', timestamp: timestamp + 1 });
  assert.equal(store.message(result.id).status, 'read');
});
test('falha incerta nunca é repetida automaticamente e não entra em contatos realizados', async t => {
  const { store, lead } = setup(t); consent(store, lead); receiveWebhook(store, live, event([inbound()]));
  let calls = 0; const fake = async () => { calls++; throw new Error('timeout'); }; const request = input();
  const first = await sendMessage(store, live, lead.id, request, fake); await sendMessage(store, live, lead.id, request, fake);
  assert.equal(first.status, 'unknown'); assert.equal(calls, 1); assert.equal(store.metrics().contacted, 0);
});
test('falha de entrega posterior ao envio é exibida e não regride com status antigo', async t => {
  const { store, lead } = setup(t); consent(store, lead); receiveWebhook(store, live, event([inbound()]));
  const result = await sendMessage(store, live, lead.id, input(), async () => Response.json({ messages: [{ id: 'wamid-failed-after-sent' }] }));
  store.delivery({ id: result.meta_id, recipient: lead.phone, status: 'sent', timestamp: Date.now() - 10000 });
  store.delivery({ id: result.meta_id, recipient: lead.phone, status: 'failed', timestamp: Date.now(), errorCode: '131026' });
  store.delivery({ id: result.meta_id, recipient: lead.phone, status: 'sent', timestamp: Date.now() - 9000 });
  assert.equal(store.message(result.id).status, 'failed');
  assert.equal(store.metrics().contacted, 0);
});
test('erro Meta não grava tokens nem resposta bruta', async t => {
  const { store, lead } = setup(t); consent(store, lead); receiveWebhook(store, live, event([inbound()]));
  const result = await sendMessage(store, live, lead.id, input(), async () => Response.json({ error: { code: 131047, message: 'segredo-ficticio-que-nao-pode-vazar' } }, { status: 400 }));
  assert.equal(result.status, 'failed'); assert.equal(result.error_code, 'Meta 131047'); assert.equal(JSON.stringify(store.messages(lead.id)).includes('segredo-ficticio'), false);
});
test('opt-out bloqueia envio e mensagens recebidas não reabrem negociação encerrada', async t => {
  const { store, lead } = setup(t); consent(store, lead); store.save({ stage: 'Sem interesse' }, lead.id);
  receiveWebhook(store, live, event([inbound('opt-out', { text: { body: 'sair' } })]));
  assert.equal(store.get(lead.id).doNotContact, true); assert.equal(store.get(lead.id).stage, 'Sem interesse');
  await assert.rejects(sendMessage(store, { mode: 'simulation' }, lead.id, input()), /bloqueado/);
});
test('banco persiste leads, mensagens e deduplicação após reinício', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'prospecta-test-')); const file = path.join(dir, 'crm.sqlite'); let store;
  try {
    store = new Store(file); const lead = store.save(leadData); receiveWebhook(store, live, event([inbound('durable')]));
    const pending = store.insertMessage({ leadId: lead.id, body: 'Interrompido', direction: 'outbound', status: 'sending', requestKey: randomUUID() });
    store.close(); store = new Store(file); receiveWebhook(store, live, event([inbound('durable')]));
    assert.equal(store.list().length, 1); assert.equal(store.messages(lead.id).length, 2); assert.equal(store.message(pending.id).status, 'unknown');
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('configuração recusa exposição em rede sem autenticação e HTTPS', () => {
  assert.throws(() => readConfig({ HOST: '0.0.0.0' }), /Acesso em rede/);
  assert.equal(readConfig({ PROSPECTA_ORIGIN: 'https://crm.example.com' }).origin, 'https://crm.example.com');
  assert.throws(() => readConfig({ PROSPECTA_ORIGIN: 'http://localhost:4317/' }), /origem/);
  assert.equal(readConfig({}).whatsapp.mode, 'simulation');
});

async function httpSetup(t, whatsapp = { mode: 'simulation' }, extra = {}) {
  const store = new Store(); const config = { host: '127.0.0.1', port: 0, origin: 'http://127.0.0.1:1', contextPath: path.join(tmpdir(), 'prospecta-contexto-inexistente-qa.json'), whatsapp, ...extra };
  for (const name of ['owner-qa', 'partner-qa']) { const user = store.createUser(name, name, testHash); if (!extra.mustChangePassword) store.changePassword(user.id, testHash); }
  const app = createApp(config, { store, fetchImpl: () => { throw new Error('Rede Meta proibida'); } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  config.origin = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); store.close(); });
  const response = await fetch(config.origin + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'owner-qa', password: testPassword }) }); const auth = await response.json(); const cookie = response.headers.get('set-cookie')?.split(';')[0];
  const request = (route, options = {}) => fetch(config.origin + route, { ...options, headers: { Cookie: cookie || '', 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrf || '', ...options.headers } });
  return { ...app, config, auth, request };
}
test('HTTP cobre sessão, CSRF, host/origem e assets com CSP', async t => {
  const { config, request } = await httpSetup(t);
  assert.equal((await fetch(config.origin + '/api/state')).status, 401);
  assert.equal((await request('/api/leads', { method: 'POST', headers: { 'X-CSRF-Token': '' }, body: JSON.stringify(leadData) })).status, 403);
  assert.equal((await request('/api/state', { headers: { Origin: 'https://malicioso.test' } })).status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    http.get(config.origin + '/api/state', { headers: { Host: 'malicioso.test' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
  const asset = await fetch(config.origin + '/'); assert.equal(asset.status, 200); assert.match(asset.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await request('/.env')).status, 404);
});
test('HTTP CRUD, importação do contexto, simulação, leitura e exportação', async t => {
  const { request } = await httpSetup(t);
  assert.equal((await request('/api/leads/import-context', { method: 'POST', body: '{}' })).status, 404);
  const imported = await (await request('/api/leads/import', { method: 'POST', body: JSON.stringify([{ ...leadData, phone: '5511000000002' }, { ...leadData, phone: '5511000000003' }]) })).json(); assert.equal(imported.imported, 2);
  const data = await (await request('/api/state')).json(); assert.equal(data.leads.length, 2); assert.ok(data.leads.every(l => !l.optIn));
  const created = await (await request('/api/leads', { method: 'POST', body: JSON.stringify(leadData) })).json(); assert.ok(created.id);
  assert.equal((await request(`/api/leads/${created.id}/simulate`, { method: 'POST', body: JSON.stringify({ body: 'Resposta fictícia' }) })).status, 200);
  const messages = await (await request(`/api/leads/${created.id}/messages`)).json(); assert.equal(messages.messages[0].simulated, 1);
  assert.equal((await request(`/api/leads/${created.id}/read`, { method: 'POST', body: '{}' })).status, 200);
  const exported = await (await request('/api/export')).json(); assert.equal(exported.leads.length, 3); assert.equal(exported.messages.length, 1);
});
test('HTTP webhook fecha simulação e exige assinatura no ambiente dedicado', async t => {
  const simulated = await httpSetup(t); assert.equal((await simulated.request('/api/whatsapp/webhook')).status, 503);
  const { request, store } = await httpSetup(t, live); store.save(leadData);
  const challenge = await request('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-ficticio&hub.challenge=123');
  assert.equal(await challenge.text(), '123');
  const body = JSON.stringify(event([inbound()]));
  assert.equal((await request('/api/whatsapp/webhook', { method: 'POST', body })).status, 401);
  const signature = 'sha256=' + createHmac('sha256', live.appSecret).update(body).digest('hex');
  assert.equal((await request('/api/whatsapp/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': signature } })).status, 200);
  assert.equal(store.messages(store.list()[0].id).length, 1);
});
test('duas contas, autenticação obrigatória e logout com revogação', async t => {
  const { config, request } = await httpSetup(t);
  for (const route of ['/api/session', '/api/state', '/api/export']) assert.equal((await fetch(config.origin + route)).status, 401);
  const login = await fetch(config.origin + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'partner-qa', password: testPassword }) });
  const partner = await login.json(); assert.equal(partner.user.username, 'partner-qa');
  assert.ok(!JSON.stringify(partner).includes(testPassword)); assert.ok(!JSON.stringify(partner).includes('password_hash'));
  const cookie = login.headers.get('set-cookie').split(';')[0]; assert.match(cookie, /prospecta_session=/);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await request('/api/session', { method: 'DELETE' })).status, 200);
  assert.equal((await request('/api/state')).status, 401);
  assert.equal((await fetch(config.origin + '/api/state', { headers: { Cookie: cookie } })).status, 200);
});

test('senha inicial bloqueia dados até troca e a senha antiga deixa de autenticar', async t => {
  const { config, request, auth } = await httpSetup(t, { mode: 'simulation' }, { mustChangePassword: true });
  assert.equal(auth.user.mustChangePassword, true);
  assert.equal((await request('/api/state')).status, 403);
  assert.equal((await request('/api/export')).status, 403);
  const changed = await request('/api/account/password', { method: 'POST', body: JSON.stringify({ currentPassword: testPassword, newPassword: 'nova-senha-ficticia-456' }) });
  assert.equal(changed.status, 200); assert.equal((await changed.json()).user.mustChangePassword, false);
  assert.equal((await request('/api/state')).status, 401);
  const oldLogin = await fetch(config.origin + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'owner-qa', password: testPassword }) });
  assert.equal(oldLogin.status, 401);
});

test('tentativas incorretas são limitadas e login antigo por token não funciona', async t => {
  const { config } = await httpSetup(t);
  const login = body => fetch(config.origin + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await login({ token: 'qualquer-token' })).status, 401);
  for (let i = 0; i < 9; i++) assert.equal((await login({ username: 'owner-qa', password: 'errada' })).status, 401);
  assert.equal((await login({ username: 'owner-qa', password: testPassword })).status, 429);
});

test('edição concorrente rejeita revisão antiga sem sobrescrever o sócio', t => {
  const { store, lead } = setup(t);
  store.save({ notes: 'Anotação do sócio', expectedUpdatedAt: lead.updatedAt }, lead.id);
  assert.throws(() => store.save({ notes: 'Anotação antiga', expectedUpdatedAt: lead.updatedAt }, lead.id), /outra pessoa/);
  assert.equal(store.get(lead.id).notes, 'Anotação do sócio');
});
