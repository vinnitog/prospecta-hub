import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import { STAGES, problem, phone, validateLead } from '../public/domain.js';
export { STAGES, problem, phone };

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
