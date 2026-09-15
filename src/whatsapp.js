import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { phone, problem } from './store.js';

const DAY = 86400000;
export function safeEqual(a, b) {
  return timingSafeEqual(createHash('sha256').update(String(a || '')).digest(), createHash('sha256').update(String(b || '')).digest());
}
// Adaptado da integração existente: assinatura sobre os bytes originais, sem importar o bot.
export function verifyMetaSignature(raw, header, secret) {
  if (!Buffer.isBuffer(raw) || !secret || !/^sha256=[a-f0-9]{64}$/i.test(header || '')) return false;
  return safeEqual(header.slice(7).toLowerCase(), createHmac('sha256', secret).update(raw).digest('hex'));
}
export function integrationStatus(config) {
  if (config.mode === 'simulation') return { mode: 'simulation', ready: false, message: 'Modo de simulação. Nenhuma mensagem sai deste computador.' };
  if (config.mode !== 'live') return { mode: 'blocked', ready: false, message: 'Modo de integração inválido.' };
  if (config.topology !== 'dedicated') return { mode: 'blocked', ready: false, message: 'Número compartilhado bloqueado até aprovação e validação do roteador. Casa dos Coleus permanece na configuração atual.' };
  if (!/^\d{5,30}$/.test(config.protectedPhoneNumberId) || config.phoneNumberId === config.protectedPhoneNumberId) return { mode: 'blocked', ready: false, message: 'Informe o ID protegido de Coleus e um remetente dedicado diferente.' };
  if (!config.accessToken || !config.appSecret || !config.verifyToken || !/^\d{5,30}$/.test(config.phoneNumberId) || !/^v\d{1,3}\.\d{1,2}$/.test(config.apiVersion)) return { mode: 'blocked', ready: false, message: 'Configuração Meta incompleta. Consulte o guia de integração.' };
  return { mode: 'live', ready: true, message: 'Número dedicado configurado. Envios manuais habilitados.' };
}
export function receiveWebhook(store, config, payload, now = Date.now()) {
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) throw problem('Evento Meta inválido.');
  let accepted = 0; let ignored = 0;
  return store.transaction(() => {
    for (const entry of payload.entry) for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      if (change?.field !== 'messages' || value?.metadata?.phone_number_id !== config.phoneNumberId) { ignored++; continue; }
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const timestamp = Number(message?.timestamp) * 1000;
        if (!message?.id || typeof message.id !== 'string' || message.id.length > 512 || !/^[1-9]\d{7,14}$/.test(message.from || '') || !Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > now + 60000) { ignored++; continue; }
        // Não criar contatos automaticamente: eventos de outros projetos não entram no CRM.
        const lead = store.byPhone(message.from);
        if (!lead) { ignored++; continue; }
        let body = message.type === 'text' ? message.text?.body : message.type === 'button' ? message.button?.text : message.type === 'interactive' ? message.interactive?.button_reply?.title || message.interactive?.list_reply?.title : undefined;
        const kind = typeof message.type === 'string' ? message.type.slice(0, 40) : 'unknown';
        if (typeof body !== 'string') body = `[Mensagem ${kind} recebida; visualização de mídia indisponível neste MVP]`;
        if (body.length > 4096) { ignored++; continue; }
        if (store.inbound(lead, { metaId: message.id, body, kind, createdAt: timestamp })) accepted++;
      }
      for (const event of Array.isArray(value.statuses) ? value.statuses : []) {
        const timestamp = Number(event?.timestamp) * 1000;
        if (typeof event?.id !== 'string' || event.id.length > 512 || !['sent', 'delivered', 'read', 'failed'].includes(event.status) || !store.byPhone(String(event.recipient_id)) || !Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > now + 60000) continue;
        store.delivery({ id: event.id, recipient: event.recipient_id, status: event.status, timestamp, errorCode: event.errors?.[0]?.code ? String(event.errors[0].code) : null });
      }
    }
    return { accepted, ignored };
  });
}

export async function sendMessage(store, config, leadId, input, fetchImpl = fetch) {
  const lead = store.get(leadId);
  if (!lead) throw problem('Lead não encontrado.', 404);
  if (!input || !/^[a-f0-9-]{36}$/i.test(input.requestKey || '')) throw problem('Identificador de envio inválido.');
  const kind = input.kind || 'text';
  if (!['text', 'template'].includes(kind)) throw problem('Tipo de mensagem inválido.');
  if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 4096) throw problem('Escreva uma mensagem de até 4096 caracteres.');
  const body = input.body.trim();
  const previous = store.request(input.requestKey);
  if (previous) {
    if (previous.lead_id !== leadId || previous.body !== body || previous.kind !== kind) throw problem('Identificador já usado em outro envio.', 409);
    return previous;
  }
  const status = integrationStatus(config);
  if (status.mode === 'blocked') throw problem(status.message, 409);
  if (lead.doNotContact) throw problem('Contato bloqueado: este lead pediu para não receber mensagens.', 409);
  if (status.mode === 'simulation') return store.insertMessage({ leadId, direction: 'outbound', body, kind, status: 'simulated', simulated: true, requestKey: input.requestKey });
  if (!lead.optIn || !lead.optInEvidence) throw problem('Registre a autorização para contato antes do envio real.', 409);
  if (kind === 'text') {
    const last = store.lastInbound(leadId);
    if (!last || last > Date.now() || Date.now() - last >= DAY) throw problem('Fora da janela de 24 horas. Use um template aprovado pela Meta.', 409);
  } else if (!config.templates.includes(body)) throw problem('Template não cadastrado na configuração aprovada.', 409);
  const busy = store.messages(leadId).some(m => m.status === 'sending');
  if (busy) throw problem('Aguarde a conclusão do envio desta conversa.', 409);
  const message = store.insertMessage({ leadId, direction: 'outbound', body, kind, status: 'sending', requestKey: input.requestKey });
  const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to: phone(lead.phone), type: kind,
    ...(kind === 'text' ? { text: { preview_url: false, body } } : { template: { name: body, language: { code: config.templateLanguage } } }) };
  let response;
  try {
    response = await fetchImpl(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), redirect: 'error',
    });
  } catch {
    store.fail(message.id, 'Resultado incerto; confira a entrega antes de tentar novamente.', 'unknown');
    return store.message(message.id);
  }
  let result;
  try { result = await response.json(); } catch { result = {}; }
  if (!response.ok) {
    store.fail(message.id, `Meta ${Number(result.error?.code) || response.status}`, response.status >= 500 ? 'unknown' : 'failed');
    return store.message(message.id);
  }
  const metaId = result.messages?.[0]?.id;
  if (typeof metaId !== 'string' || !metaId || metaId.length > 512) { store.fail(message.id, 'Meta não retornou um identificador de mensagem.', 'unknown'); return store.message(message.id); }
  store.markSent(message.id, metaId);
  const current = store.get(leadId);
  if (current.stage === 'Não contatado') store.save({ stage: 'Mensagem enviada' }, leadId);
  return store.message(message.id);
}
