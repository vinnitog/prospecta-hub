import { STAGES, problem, validateLead } from './domain.js';

export const STORAGE_KEY = 'prospecta-hub:private-browser-data:v1';
const successful = ['accepted', 'sent', 'delivered', 'read'];
const uuid = /^[a-f0-9-]{36}$/i;

function visibleLeads(db) {
  return db.leads.map(lead => {
    const messages = db.messages.filter(m => m.lead_id === lead.id).sort((a, b) => a.created_at - b.created_at);
    return { ...lead, unread: messages.filter(m => m.direction === 'inbound' && !m.read_at).length, lastMessage: messages.at(-1) || null };
  });
}
function metrics(db) {
  const contacted = new Set(db.messages.filter(m => !m.simulated && m.direction === 'outbound' && successful.includes(m.status)).map(m => m.lead_id));
  const replied = new Set(db.messages.filter(m => !m.simulated && m.direction === 'inbound').map(m => m.lead_id));
  const groups = key => [...new Set(db.leads.map(l => l[key] || 'Não informado'))].map(name => {
    const leads = db.leads.filter(l => (l[key] || 'Não informado') === name); const clients = leads.filter(l => l.stage === 'Cliente').length;
    return { name, total: leads.length, clients, conversion: clients / leads.length };
  });
  return { total: db.leads.length, qualified: db.leads.filter(l => l.score >= 7).length, contacted: contacted.size, replied: replied.size,
    responseRate: contacted.size ? [...contacted].filter(id => replied.has(id)).length / contacted.size : 0,
    stages: STAGES.map(name => ({ name, total: db.leads.filter(l => l.stage === name).length })), segments: groups('segment'), cities: groups('city') };
}
function saveLead(db, input, id) {
  const previous = id ? db.leads.find(l => l.id === id) : undefined;
  if (id && !previous) throw problem('Lead não encontrado.', 404);
  if (previous && input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== previous.updatedAt) throw problem('Este lead mudou em outra aba. Reabra o cadastro.', 409);
  const data = validateLead(input, previous);
  if (db.leads.some(l => l.phone === data.phone && l.id !== id)) throw problem('Já existe um lead com esse telefone.', 409);
  const now = Math.max(Date.now(), (previous?.updatedAt || 0) + 1);
  const lead = { ...data, id: id || crypto.randomUUID(), createdAt: previous?.createdAt || now, updatedAt: now };
  if (previous) db.leads[db.leads.indexOf(previous)] = lead; else db.leads.push(lead);
  return lead;
}
function importData(db, input) {
  const rows = Array.isArray(input) ? input : input?.leads;
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw problem('Importe de 1 a 500 leads em JSON.');
  const messages = Array.isArray(input) ? [] : input.messages || [];
  if (!Array.isArray(messages) || messages.length > 20000) throw problem('Histórico de backup inválido ou muito grande.');
  let imported = 0; let skipped = 0; let restoredMessages = 0; const ids = new Map();
  for (const row of rows) {
    const valid = validateLead(row);
    let lead = db.leads.find(l => l.phone === valid.phone);
    if (lead) skipped++; else { lead = saveLead(db, valid); imported++; }
    if (row.id) { if (ids.has(row.id)) throw problem('Backup contém identificadores duplicados.'); ids.set(row.id, lead.id); }
  }
  for (const source of messages) {
    const leadId = ids.get(source?.lead_id);
    if (!leadId || !uuid.test(source.id || '') || typeof source.body !== 'string' || source.body.length > 4096 || !['inbound', 'outbound'].includes(source.direction)
      || !['received', 'simulated', 'sending', 'accepted', 'sent', 'delivered', 'read', 'failed', 'unknown'].includes(source.status)
      || !Number.isSafeInteger(source.created_at) || source.created_at <= 0 || ![0, 1].includes(source.simulated)) throw problem('Backup contém uma mensagem inválida. Nada foi importado.');
    const prior = db.messages.find(m => m.id === source.id);
    if (prior) { if (prior.lead_id !== leadId || prior.body !== source.body) throw problem('Conflito no histórico do backup.'); continue; }
    db.messages.push({ id: source.id, lead_id: leadId, body: source.body, direction: source.direction, kind: ['text', 'template'].includes(source.kind) ? source.kind : 'media',
      status: source.status === 'sending' ? 'unknown' : source.status, simulated: source.simulated, created_at: source.created_at,
      read_at: Number.isSafeInteger(source.read_at) ? source.read_at : null, request_key: null, error_code: null, meta_id: null });
    restoredMessages++;
  }
  return { imported, skipped, restoredMessages };
}

export function handleBrowserRequest(db, url, options = {}) {
  const method = options.method || 'GET'; const input = options.body ? JSON.parse(options.body) : undefined;
  if (url === '/api/session' && method === 'GET') return { csrf: 'browser-local' };
  if (url === '/api/state' && method === 'GET') return { leads: visibleLeads(db), metrics: metrics(db), stages: STAGES, templates: [], integration: {
    mode: 'simulation', ready: false, message: 'Dados somente neste navegador, sem sincronização. Exporte backups. WhatsApp em simulação, sem envio real.',
  } };
  if (url === '/api/export' && method === 'GET') return { exportedAt: new Date().toISOString(), version: 1, leads: db.leads, messages: db.messages };
  if (url === '/api/leads' && method === 'POST') return saveLead(db, input);
  if (url === '/api/leads/import' && method === 'POST') return importData(db, input);
  const route = /^\/api\/leads\/([a-f0-9-]{36})(?:\/(messages|read|simulate))?$/.exec(url);
  if (!route) throw problem('Operação indisponível nesta versão.', 404);
  const [, id, action] = route; const lead = db.leads.find(l => l.id === id);
  if (!lead) throw problem('Lead não encontrado.', 404);
  if (!action && method === 'PATCH') return saveLead(db, input, id);
  if (action === 'messages' && method === 'GET') return { messages: db.messages.filter(m => m.lead_id === id).sort((a, b) => a.created_at - b.created_at), lastInboundAt: null };
  if (action === 'read' && method === 'POST') { db.messages.filter(m => m.lead_id === id && m.direction === 'inbound' && !m.read_at).forEach(m => { m.read_at = Date.now(); }); return { ok: true }; }
  if (['messages', 'simulate'].includes(action) && method === 'POST') {
    const outgoing = action === 'messages';
    if (typeof input?.body !== 'string' || !input.body.trim() || input.body.length > 4096) throw problem('Escreva uma mensagem de até 4096 caracteres.');
    if (outgoing && !uuid.test(input.requestKey || '')) throw problem('Identificador de envio inválido.');
    if (outgoing && (input.kind || 'text') !== 'text') throw problem('Templates reais não estão disponíveis no navegador.');
    const previous = outgoing && db.messages.find(m => m.request_key === input.requestKey);
    if (previous) { if (previous.lead_id !== id || previous.body !== input.body.trim()) throw problem('Identificador usado em outro envio.', 409); return previous; }
    if (outgoing && lead.doNotContact) throw problem('Este lead está marcado como não contatar.', 409);
    const message = { id: crypto.randomUUID(), lead_id: id, direction: outgoing ? 'outbound' : 'inbound', body: input.body.trim(), kind: 'text',
      status: outgoing ? 'simulated' : 'received', simulated: 1, created_at: Date.now(), read_at: null, request_key: outgoing ? input.requestKey : null, meta_id: null, error_code: null };
    db.messages.push(message); lead.updatedAt = Math.max(Date.now(), lead.updatedAt + 1); return message;
  }
  throw problem('Operação indisponível nesta versão.', 405);
}

export function createBrowserApi({ storage, locks = globalThis.navigator?.locks } = {}) {
  return async (url, options = {}) => {
    if (!locks) throw problem('Este navegador não oferece armazenamento coordenado. Use um navegador atualizado.');
    return locks.request(STORAGE_KEY, async () => {
      let db;
      try { storage ??= globalThis.localStorage; const raw = storage.getItem(STORAGE_KEY); db = raw ? JSON.parse(raw) : { version: 1, leads: [], messages: [] }; }
      catch { throw problem('Não foi possível ler a base local. Os dados existentes foram preservados.'); }
      if (db?.version !== 1 || !Array.isArray(db.leads) || !Array.isArray(db.messages)) throw problem('Formato da base local não reconhecido. Os dados não foram alterados.');
      const result = handleBrowserRequest(db, url, options);
      if ((options.method || 'GET') !== 'GET') {
        try { storage.setItem(STORAGE_KEY, JSON.stringify(db)); }
        catch { throw problem('Não foi possível salvar: armazenamento cheio ou indisponível. Exporte um backup antes de continuar.'); }
      }
      return structuredClone(result);
    });
  };
}
