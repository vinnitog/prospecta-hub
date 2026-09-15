import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createBrowserApi, STORAGE_KEY } from '../public/browser-store.js';

const lead = { company: 'Empresa fictícia do navegador', phone: '5511000000001', segment: 'Teste', city: 'Cidade de teste', score: 9 };
const post = body => ({ method: 'POST', body: JSON.stringify(body) });
function setup() {
  let value = null; let fail = false; let queue = Promise.resolve();
  const storage = { getItem: () => value, setItem: (_, text) => { if (fail) throw new Error('quota'); value = text; } };
  const locks = { request: (_, fn) => { const job = queue.then(fn); queue = job.catch(() => {}); return job; } };
  return { api: createBrowserApi({ storage, locks }), storage, locks, failWrites: () => { fail = true; } };
}
test('navegador inicia sem login, salva e recupera a base em nova instância', async () => {
  const { api, storage, locks } = setup();
  assert.equal((await api('/api/state')).leads.length, 0);
  await api('/api/leads', post(lead));
  const reloaded = createBrowserApi({ storage, locks });
  assert.equal((await reloaded('/api/state')).leads[0].company, lead.company);
});
test('mensagens simuladas persistem e backup restaura histórico sem duplicar', async () => {
  const { api } = setup(); const created = await api('/api/leads', post(lead));
  const outgoing = post({ body: 'Teste fictício', requestKey: randomUUID() });
  await api(`/api/leads/${created.id}/messages`, outgoing); await api(`/api/leads/${created.id}/messages`, outgoing);
  await api(`/api/leads/${created.id}/simulate`, post({ body: 'Resposta fictícia' }));
  const backup = await api('/api/export'); assert.equal(backup.messages.length, 2);
  const other = setup().api;
  const imported = await other('/api/leads/import', post(backup)); assert.equal(imported.restoredMessages, 2);
  await other('/api/leads/import', post(backup));
  const state = await other('/api/state'); assert.equal(state.leads.length, 1); assert.equal(state.metrics.contacted, 0);
  const history = await other(`/api/leads/${state.leads[0].id}/messages`); assert.equal(history.messages.length, 2); assert.equal(history.lastInboundAt, null);
});
test('importação inválida é atômica e quota não perde os registros anteriores', async () => {
  const { api, failWrites } = setup(); await api('/api/leads', post(lead));
  await assert.rejects(api('/api/leads/import', post([{ ...lead, phone: '5511000000002' }, { company: 'Inválida' }])));
  assert.equal((await api('/api/state')).leads.length, 1);
  failWrites(); await assert.rejects(api('/api/leads', post({ ...lead, phone: '5511000000003' })), /armazenamento/);
  assert.equal((await api('/api/state')).leads.length, 1);
});
test('duas abas coordenam gravações e rejeitam formulário obsoleto', async () => {
  const { api, storage, locks } = setup(); const tab2 = createBrowserApi({ storage, locks });
  await Promise.all([api('/api/leads', post(lead)), tab2('/api/leads', post({ ...lead, phone: '5511000000002' }))]);
  const state = await api('/api/state'); assert.equal(state.leads.length, 2); const row = state.leads[0];
  await api(`/api/leads/${row.id}`, { method: 'PATCH', body: JSON.stringify({ notes: 'Outra aba', expectedUpdatedAt: row.updatedAt }) });
  await assert.rejects(tab2(`/api/leads/${row.id}`, { method: 'PATCH', body: JSON.stringify({ notes: 'Antigo', expectedUpdatedAt: row.updatedAt }) }), /outra aba/);
});
test('não contatar bloqueia simulação e dados corrompidos não são sobrescritos', async () => {
  const { api, storage } = setup(); const row = await api('/api/leads', post({ ...lead, doNotContact: true }));
  await assert.rejects(api(`/api/leads/${row.id}/messages`, post({ body: 'Teste', requestKey: randomUUID() })), /não contatar/);
  storage.setItem(STORAGE_KEY, 'corrompido');
  await assert.rejects(api('/api/leads', post(lead)), /preservados/);
  assert.equal(storage.getItem(STORAGE_KEY), 'corrompido');
});
test('backup não aceita mensagem sem lead correspondente', async () => {
  const { api } = setup();
  await assert.rejects(api('/api/leads/import', post({ leads: [lead], messages: [{ id: randomUUID(), lead_id: randomUUID(), body: 'Teste', direction: 'inbound', status: 'received', created_at: Date.now(), simulated: 1 }] })), /mensagem inválida/);
  assert.equal((await api('/api/state')).leads.length, 0);
});
