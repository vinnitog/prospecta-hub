import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const STAGES = ['Não contatado', 'Mensagem enviada', 'Respondeu', 'Interessado', 'Demonstração', 'Negociação', 'Cliente', 'Sem interesse'];
export function problem(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function phone(value) {
  if (typeof value !== 'string' || !/^[+\d\s().-]+$/.test(value)) throw problem('Telefone inválido. Informe DDI + DDD + número.');
  const digits = value.replace(/\D/g, '');
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw problem('Telefone inválido. Informe DDI + DDD + número.');
  return digits;
}
function string(value, name, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw problem(`${name} inválido.`);
  return value.trim();
}
function validateLead(input, existing = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw problem('Lead inválido.');
  const data = { company: '', phone: '', segment: '', city: '', source: 'Cadastro manual', score: 5, stage: STAGES[0], tags: [], notes: '', optIn: false, optInEvidence: '', doNotContact: false, ...existing, ...input };
  const result = {};
  for (const [key, max] of Object.entries({ company: 160, segment: 100, city: 100, source: 160, notes: 5000, optInEvidence: 500 })) {
    result[key] = string(data[key], key, max, key === 'company');
  }
  result.phone = phone(data.phone);
  if (existing.phone && result.phone !== existing.phone) throw problem('O telefone não pode ser alterado após o cadastro, para preservar a identidade da conversa.');
  if (!Number.isInteger(data.score) || data.score < 0 || data.score > 10) throw problem('Score deve ser um inteiro de 0 a 10.');
  if (!STAGES.includes(data.stage)) throw problem('Etapa comercial inválida.');
  if (!Array.isArray(data.tags) || data.tags.length > 12 || data.tags.some(t => typeof t !== 'string' || t.length > 40)) throw problem('Use até 12 tags de 40 caracteres.');
  if (typeof data.optIn !== 'boolean' || typeof data.doNotContact !== 'boolean') throw problem('Preferência de contato inválida.');
  if (data.optIn && !result.optInEvidence) throw problem('Registre a evidência da autorização para contato.');
  return { ...result, score: data.score, stage: data.stage, tags: [...new Set(data.tags.map(t => t.trim()).filter(Boolean))], optIn: data.optIn, doNotContact: data.doNotContact, botActive: false };
}

export class Store {
  constructor(file = ':memory:') {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, phone TEXT UNIQUE NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id), meta_id TEXT UNIQUE, direction TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, simulated INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, read_at INTEGER, request_key TEXT UNIQUE, error_code TEXT);
      CREATE INDEX IF NOT EXISTS messages_lead_time ON messages(lead_id, created_at);
      CREATE TABLE IF NOT EXISTS delivery_events (meta_id TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL, timestamp INTEGER NOT NULL, error_code TEXT, PRIMARY KEY(meta_id,status,timestamp));
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, must_change_password INTEGER NOT NULL DEFAULT 1, password_version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL, resource_id TEXT, created_at INTEGER NOT NULL);
      PRAGMA user_version=2;`);
    // Um envio interrompido pode ter chegado à Meta. Nunca reenviá-lo automaticamente.
    this.db.prepare("UPDATE messages SET status='unknown' WHERE status='sending'").run();
  }
  close() { this.db.close(); }
  user(username) { return this.db.prepare('SELECT * FROM users WHERE username=?').get(username); }
  userById(id) { return this.db.prepare('SELECT * FROM users WHERE id=?').get(id); }
  createUser(username, displayName, passwordHash) {
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw problem('Usuário deve ter 3–40 letras minúsculas, números, ponto, hífen ou sublinhado.');
    if (this.user(username)) throw problem('Usuário já existe.', 409);
    this.db.prepare('INSERT INTO users(id,username,display_name,password_hash) VALUES(?,?,?,?)').run(randomUUID(), username, displayName, passwordHash);
    return this.user(username);
  }
  changePassword(id, hash) { this.db.prepare('UPDATE users SET password_hash=?,must_change_password=0,password_version=password_version+1 WHERE id=?').run(hash, id); }
  audit(userId, action, resourceId = null) { this.db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?)').run(randomUUID(), userId, action, resourceId, Date.now()); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  mapLead(row) {
    if (!row) return null;
    const unread = this.db.prepare("SELECT count(*) AS n FROM messages WHERE lead_id=? AND direction='inbound' AND read_at IS NULL").get(row.id).n;
    const last = this.db.prepare('SELECT body,created_at,simulated FROM messages WHERE lead_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(row.id);
    return { ...JSON.parse(row.data), id: row.id, phone: row.phone, createdAt: row.created_at, updatedAt: row.updated_at, unread, lastMessage: last || null };
  }
  list() { return this.db.prepare('SELECT * FROM leads ORDER BY updated_at DESC').all().map(row => this.mapLead(row)); }
  get(id) { return this.mapLead(this.db.prepare('SELECT * FROM leads WHERE id=?').get(id)); }
  byPhone(number) { return this.mapLead(this.db.prepare('SELECT * FROM leads WHERE phone=?').get(number)); }
  save(input, id) {
    const existing = id ? this.get(id) : undefined;
    if (id && !existing) throw problem('Lead não encontrado.', 404);
    if (existing && input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== existing.updatedAt) throw problem('Este lead foi atualizado por outra pessoa. Reabra o cadastro antes de salvar.', 409);
    const data = validateLead(input, existing);
    const duplicate = this.byPhone(data.phone);
    if (duplicate && duplicate.id !== id) throw problem('Já existe um lead com esse telefone.', 409);
    const key = id || randomUUID(); const now = Math.max(Date.now(), (existing?.updatedAt || 0) + 1);
    this.db.prepare(`INSERT INTO leads VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`).run(key, data.phone, JSON.stringify(data), existing?.createdAt || now, now);
    return this.get(key);
  }
  import(rows) {
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) throw problem('Importe de 1 a 500 leads em um array JSON.');
    return this.transaction(() => {
      let imported = 0; let skipped = 0;
      for (const row of rows) {
        const data = validateLead(row);
        if (this.byPhone(data.phone)) { skipped++; continue; }
        this.save(data); imported++;
      }
      return { imported, skipped };
    });
  }
  messages(id) { return this.db.prepare('SELECT * FROM messages WHERE lead_id=? ORDER BY created_at,rowid').all(id); }
  read(id) { this.db.prepare("UPDATE messages SET read_at=? WHERE lead_id=? AND read_at IS NULL AND direction='inbound'").run(Date.now(), id); }
  insertMessage({ leadId, metaId = null, direction, body, kind = 'text', status, simulated = false, createdAt = Date.now(), requestKey = null }) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO messages(id,lead_id,meta_id,direction,body,kind,status,simulated,created_at,request_key) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, leadId, metaId, direction, body, kind, status, Number(simulated), createdAt, requestKey);
    this.db.prepare('UPDATE leads SET updated_at=? WHERE id=?').run(Date.now(), leadId);
    return this.message(id);
  }
  message(id) { return this.db.prepare('SELECT * FROM messages WHERE id=?').get(id); }
  request(key) { return this.db.prepare('SELECT * FROM messages WHERE request_key=?').get(key); }
  lastInbound(id) { return this.db.prepare("SELECT max(created_at) AS at FROM messages WHERE lead_id=? AND direction='inbound' AND simulated=0").get(id).at; }
  inbound(lead, message, simulated = false) {
    if (message.metaId && this.db.prepare('SELECT id FROM messages WHERE meta_id=?').get(message.metaId)) return false;
    this.insertMessage({ leadId: lead.id, direction: 'inbound', status: 'received', simulated, ...message });
    if (!simulated && [STAGES[0], STAGES[1]].includes(lead.stage)) this.save({ stage: 'Respondeu' }, lead.id);
    if (!simulated && /^(sair|parar|stop|não me contate|nao me contate)$/i.test(message.body.trim())) this.save({ doNotContact: true, optIn: false }, lead.id);
    return true;
  }
  markSent(id, metaId) {
    this.db.prepare("UPDATE messages SET meta_id=?,status='accepted' WHERE id=?").run(metaId, id);
    this.reconcile(metaId);
  }
  fail(id, code, status = 'failed') { this.db.prepare('UPDATE messages SET status=?,error_code=? WHERE id=?').run(status, String(code), id); }
  delivery(event) {
    this.db.prepare('INSERT OR IGNORE INTO delivery_events VALUES(?,?,?,?,?)').run(event.id, event.recipient, event.status, event.timestamp, event.errorCode || null);
    this.reconcile(event.id);
    this.db.prepare('DELETE FROM delivery_events WHERE timestamp < ?').run(Date.now() - 7 * 86400000);
  }
  reconcile(metaId) {
    const msg = this.db.prepare('SELECT m.*,l.phone FROM messages m JOIN leads l ON l.id=m.lead_id WHERE m.meta_id=? AND m.direction=\'outbound\'').get(metaId);
    if (!msg) return;
    const events = this.db.prepare('SELECT * FROM delivery_events WHERE meta_id=? AND recipient=? ORDER BY timestamp').all(metaId, msg.phone);
    let status = msg.status; let code = msg.error_code;
    for (const event of events) {
      if (status === 'read' || (status === 'delivered' && event.status !== 'read')) continue;
      status = event.status; code = event.error_code;
    }
    this.db.prepare('UPDATE messages SET status=?,error_code=? WHERE id=?').run(status, code, msg.id);
  }
  metrics() {
    const leads = this.list();
    const outbound = new Set(this.db.prepare("SELECT DISTINCT lead_id FROM messages WHERE direction='outbound' AND simulated=0 AND status IN ('accepted','sent','delivered','read')").all().map(r => r.lead_id));
    const inbound = new Set(this.db.prepare("SELECT DISTINCT lead_id FROM messages WHERE direction='inbound' AND simulated=0").all().map(r => r.lead_id));
    const group = key => [...new Set(leads.map(l => l[key] || 'Não informado'))].map(name => {
      const subset = leads.filter(l => (l[key] || 'Não informado') === name);
      const clients = subset.filter(l => l.stage === 'Cliente').length;
      return { name, total: subset.length, clients, conversion: subset.length ? clients / subset.length : 0 };
    });
    return { total: leads.length, qualified: leads.filter(l => l.score >= 7).length, contacted: outbound.size, replied: inbound.size,
      responseRate: outbound.size ? [...outbound].filter(id => inbound.has(id)).length / outbound.size : 0,
      stages: STAGES.map(name => ({ name, total: leads.filter(l => l.stage === name).length })), segments: group('segment'), cities: group('city') };
  }
}
