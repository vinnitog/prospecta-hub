const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = name => name.split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase();
const number = value => Number(value).toLocaleString('pt-BR');
const date = value => new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const titles = { leads: 'Sua próxima conversa começa aqui.', inbox: 'Conversas que viram oportunidades.', pipeline: 'Cada contato, um próximo passo.', metrics: 'Entenda o que está funcionando.', integration: 'Um canal. Contextos bem separados.' };
const statuses = { received: 'Recebida', simulated: 'Simulação local', sending: 'Enviando', accepted: 'Aceita pela Meta', sent: 'Enviada', delivered: 'Entregue', read: 'Lida', failed: 'Falhou', unknown: 'Entrega incerta · confira antes de reenviar' };
let state = { leads: [], stages: [], metrics: {}, integration: {} }; let csrf = ''; let view = 'leads'; let selectedId = null; let toastTimer; let polling = false;
const drafts = new Map(); const pendingRequests = new Map(); const sending = new Set();
let currentUser = null; let authEpoch = 0;
function lockScreen() {
  authEpoch++; csrf = ''; currentUser = null; selectedId = null;
  state = { leads: [], stages: [], metrics: {}, integration: {} };
  drafts.clear(); pendingRequests.clear(); sending.clear();
  $('#content').replaceChildren(); $('#crm-main').hidden = true; $('#crm-sidebar').hidden = true;
  $('#lead-dialog').close(); $('#password-dialog').close(); $('#lead-form').reset();
  if (!$('#login-dialog').open) $('#login-dialog').showModal();
}
async function unlockScreen(result) {
  csrf = result.csrf; currentUser = result.user; $('#login-dialog').close();
  $('#account-name').textContent = currentUser.displayName;
  if (currentUser.mustChangePassword) { $('#password-dialog').showModal(); return; }
  $('#crm-main').hidden = false; $('#crm-sidebar').hidden = false; await refresh();
}
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6500); }
async function api(url, options = {}) {
  const epoch = authEpoch;
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...options.headers } });
  const data = await response.json();
  if (epoch !== authEpoch) throw new Error('Sessão encerrada.');
  if (!response.ok) { if (response.status === 401 && url !== '/api/session') lockScreen(); throw new Error(data.error || 'Não foi possível concluir.'); }
  return data;
}
async function guarded(fn) { try { await fn(); } catch (error) { toast(error.message); } }
async function refresh(render = true) {
  state = await api('/api/state');
  $('#lead-count').textContent = state.leads.length;
  $('#unread-count').textContent = state.leads.reduce((sum, lead) => sum + lead.unread, 0);
  $('#mode-banner').classList.toggle('blocked', state.integration.mode === 'blocked');
  $('#mode-banner').innerHTML = `<strong>${state.integration.mode === 'simulation' ? '○ SIMULAÇÃO LOCAL' : state.integration.ready ? '● WHATSAPP ATIVO' : '○ ATIVAÇÃO PENDENTE'}</strong> ${escape(state.integration.message)}`;
  $('#sidebar-status').textContent = state.integration.ready ? 'Operação com número dedicado' : 'Operação isolada';
  if (render) renderView();
  else if (view === 'inbox' && $('.conversation-list')) {
    const leads = [...state.leads].sort((a, b) => (b.lastMessage?.created_at || 0) - (a.lastMessage?.created_at || 0));
    $('.conversation-list').innerHTML = `<div class="list-label">CONVERSAS · ${leads.length}</div>${leads.map(l => `<button class="conversation ${l.id === selectedId ? 'selected' : ''}" data-chat="${l.id}"><small>${l.unread ? `${l.unread} nova(s)` : ''}</small><strong>${escape(l.company)}</strong><p>${escape(l.lastMessage?.body || 'Conversa ainda não iniciada')}</p></button>`).join('')}`;
  }
}
function metricsCards() {
  const m = state.metrics;
  return `<div class="metrics">${[
    ['Leads na base', m.total, 'Sua carteira de oportunidades'], ['Qualificados A/B', m.qualified, 'Score inicial a partir de 7'],
    ['Contatos realizados', m.contacted, 'Apenas envios reais aceitos'], ['Taxa de resposta', `${Math.round(m.responseRate * 100)}%`, 'Entre os contatos realizados'],
  ].map(([label, value, note], i) => `<div class="metric"><div class="metric-title">${label}</div><div class="metric-value ${i === 1 ? 'accent' : ''}">${value}</div><div class="metric-note">${note}</div></div>`).join('')}</div>`;
}
function empty(title, description, action = '') { return `<div class="empty"><span class="empty-symbol">↗</span><h2>${title}</h2><p>${description}</p>${action}</div>`; }
function stageOptions(value) { return state.stages.map(stage => `<option ${stage === value ? 'selected' : ''}>${escape(stage)}</option>`).join(''); }
function stagePill(stage) { return `<span class="pill ${['Interessado', 'Demonstração', 'Negociação', 'Cliente'].includes(stage) ? 'good' : ''}">${escape(stage)}</span>`; }
function renderView() {
  if (!currentUser || currentUser.mustChangePassword) return;
  $('#page-title').textContent = titles[view];
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'); });
  if (view === 'leads') renderLeads();
  if (view === 'pipeline') renderPipeline();
  if (view === 'inbox') renderInbox();
  if (view === 'metrics') renderMetrics();
  if (view === 'integration') renderIntegration();
}
function renderLeads() {
  $('#content').innerHTML = `${metricsCards()}<div class="section-heading"><div><h2>Empresas no seu radar</h2><p>Qualifique, conheça e encontre o momento de conversar.</p></div><div class="action-row"><button class="button secondary" data-action="import">Importar JSON</button><button class="button secondary" data-action="export">↓ Exportar</button></div></div>${state.leads.length ? `<div class="toolbar"><input id="search" type="search" placeholder="Buscar empresa, segmento ou cidade…" aria-label="Buscar leads"><select id="stage-filter" aria-label="Filtrar etapa"><option value="">Todas as etapas</option>${stageOptions('')}</select></div><div class="table-wrap"><table><thead><tr><th>EMPRESA</th><th>SEGMENTO</th><th>QUALIFICAÇÃO</th><th>ETAPA</th><th>PRÓXIMO PASSO</th></tr></thead><tbody id="leads-body"></tbody></table></div><p class="import-note">Scores são preliminares. Telefone público não comprova WhatsApp ativo nem autorização para contato. <button class="text-button" data-action="import-context">Importar os 15 leads do documento</button></p>` : empty('Comece com uma base pequena e boa.', 'O documento reúne 15 empresas de Marília para qualificar. Importe essa base ou cadastre seu primeiro lead. Nenhum contato será realizado automaticamente.', '<button class="button primary" data-action="import-context">Importar 15 leads de Marília</button>')}`;
  if (state.leads.length) { renderLeadRows(); $('#search').addEventListener('input', renderLeadRows); $('#stage-filter').addEventListener('change', renderLeadRows); }
}
function renderLeadRows() {
  const query = $('#search').value.toLocaleLowerCase('pt-BR'); const stage = $('#stage-filter').value;
  const leads = state.leads.filter(l => (!stage || l.stage === stage) && `${l.company} ${l.city} ${l.segment} ${l.tags.join(' ')}`.toLocaleLowerCase('pt-BR').includes(query)).sort((a, b) => b.score - a.score || a.company.localeCompare(b.company, 'pt-BR'));
  $('#leads-body').innerHTML = leads.map(l => `<tr><td><div class="company-cell"><span class="avatar">${escape(initials(l.company))}</span><div><button class="text-button" data-edit="${l.id}">${escape(l.company)}</button><small>${escape(l.city || 'Cidade não informada')}${l.doNotContact ? ' · Não contatar' : ''}</small></div></div></td><td>${escape(l.segment || '—')}</td><td><span class="score ${l.score < 7 ? 'low' : ''}">${l.score >= 9 ? 'A' : l.score >= 7 ? 'B' : 'C'} · ${l.score}/10</span></td><td>${stagePill(l.stage)}</td><td><div class="row-actions"><button class="text-button" data-chat="${l.id}">Abrir conversa ↗</button><button class="text-button" data-edit="${l.id}">Editar</button></div></td></tr>`).join('') || '<tr><td colspan="5">Nenhum lead encontrado com esses filtros.</td></tr>';
}
function renderPipeline() {
  $('#content').innerHTML = `<div class="section-heading"><div><h2>Da primeira conversa à venda</h2><p>Mude a etapa em cada cartão para registrar o avanço comercial.</p></div><span class="pill">${state.leads.length} leads</span></div><div class="board">${state.stages.map(stage => {
    const leads = state.leads.filter(l => l.stage === stage);
    return `<section class="column"><h3 class="column-title">${escape(stage)} <span>${leads.length}</span></h3>${leads.map(l => `<article class="lead-card"><button class="text-button" data-edit="${l.id}">${escape(l.company)}</button><p>${escape(l.segment || 'Sem segmento')}</p><span class="score">${l.score}/10</span><select data-stage="${l.id}" aria-label="Etapa de ${escape(l.company)}">${stageOptions(stage)}</select></article>`).join('') || '<p class="muted">Nenhum lead nesta etapa.</p>'}</section>`;
  }).join('')}</div>`;
}
function renderInbox() {
  const leads = [...state.leads].sort((a, b) => (b.lastMessage?.created_at || 0) - (a.lastMessage?.created_at || 0));
  if (!leads.length) { $('#content').innerHTML = empty('Sua caixa de entrada está pronta.', 'Cadastre ou importe um lead para abrir uma conversa e testar o atendimento manual.', '<button class="button primary" data-action="go-leads">Ver leads</button>'); return; }
  if (!selectedId || !state.leads.some(l => l.id === selectedId)) selectedId = leads[0].id;
  const lead = state.leads.find(l => l.id === selectedId);
  $('#content').innerHTML = `<div class="inbox"><div class="conversation-list"><div class="list-label">CONVERSAS · ${leads.length}</div>${leads.map(l => `<button class="conversation ${l.id === selectedId ? 'selected' : ''}" data-chat="${l.id}"><small>${l.unread ? `${l.unread} nova(s)` : ''}</small><strong>${escape(l.company)}</strong><p>${escape(l.lastMessage?.body || 'Conversa ainda não iniciada')}</p></button>`).join('')}</div><div class="thread"><div class="thread-header"><div><h3>${escape(lead.company)}</h3><p>+${escape(lead.phone)} · ${escape(lead.segment)}</p></div><button class="text-button" data-edit="${lead.id}">Ver contato ↗</button></div><div id="messages" class="messages" aria-label="Histórico de mensagens"></div><form id="composer" class="composer"><div class="composer-top"><select id="message-kind" aria-label="Tipo de mensagem"><option value="text">Mensagem de texto</option><option value="template">Template aprovado</option></select><span id="window-label">Atendimento manual · bot desligado</span></div><label id="template-label" hidden>Template disponível<select id="template-name">${state.templates.map(t => `<option>${escape(t)}</option>`).join('')}</select></label><div class="composer-row"><textarea id="message-body" aria-label="Sua mensagem" rows="2" maxlength="4096" placeholder="Escreva com o contexto desta empresa…"></textarea><button id="send-button" class="button primary" ${lead.doNotContact || state.integration.mode === 'blocked' ? 'disabled' : ''}>${state.integration.mode === 'simulation' ? 'Simular envio' : 'Enviar mensagem'}</button></div><div class="composer-foot"><span>${lead.doNotContact ? 'Este lead está marcado como não contatar.' : state.integration.mode === 'simulation' ? 'Mensagens simuladas ficam apenas neste CRM.' : 'Envio manual pela Cloud API.'}</span>${state.integration.mode === 'simulation' ? '<button type="button" class="simulation-button" id="simulate-reply">+ Simular resposta</button>' : ''}</div></form></div></div>`;
  const restoreDraft = drafts.get(lead.id);
  if (restoreDraft) { $('#message-body').value = restoreDraft.body; $('#message-kind').value = restoreDraft.kind; $('#template-name').value = restoreDraft.template; }
  const updateComposer = () => {
    const template = $('#message-kind').value === 'template'; $('#template-label').hidden = !template; $('#message-body').hidden = template;
    drafts.set(lead.id, { body: $('#message-body').value, kind: $('#message-kind').value, template: $('#template-name').value });
  };
  updateComposer();
  if (sending.has(lead.id)) $('#send-button').disabled = true;
  $('#message-kind').addEventListener('change', updateComposer);
  $('#template-name').addEventListener('change', updateComposer);
  $('#message-body').addEventListener('input', updateComposer);
  $('#composer').addEventListener('submit', event => { event.preventDefault(); guarded(submitMessage); });
  $('#simulate-reply')?.addEventListener('click', () => guarded(async () => {
    await api(`/api/leads/${selectedId}/simulate`, { method: 'POST', body: JSON.stringify({ body: 'Olá! Como funciona o sistema de estoque offline?' }) });
    await loadMessages(true); await refresh(false); toast('Resposta fictícia adicionada. Nenhuma mensagem foi recebida da Meta.');
  }));
  guarded(() => loadMessages(true));
}
async function loadMessages(markRead = false) {
  const id = selectedId;
  const result = await api(`/api/leads/${id}/messages`);
  if (view !== 'inbox' || id !== selectedId || !$('#messages')) return;
  const box = $('#messages'); const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = result.messages.map(m => `<div class="bubble ${m.direction}">${m.simulated ? '<div class="simulation-label">SIMULAÇÃO · SEM ENVIO REAL</div>' : ''}${escape(m.body)}<small>${date(m.created_at)} · ${escape(statuses[m.status] || m.status)}${m.error_code ? ` · ${escape(m.error_code)}` : ''}</small></div>`).join('') || '<div class="empty compact"><h2>A primeira mensagem faz diferença.</h2><p>Leia o contexto do lead e escreva uma abordagem individual.</p></div>';
  if (nearBottom || markRead) box.scrollTop = box.scrollHeight;
  if (markRead) { await api(`/api/leads/${id}/read`, { method: 'POST', body: '{}' }); await refresh(false); }
  const remaining = result.lastInboundAt ? Math.max(0, Math.ceil((result.lastInboundAt + 86400000 - Date.now()) / 3600000)) : 0;
  if ($('#window-label')) $('#window-label').textContent = state.integration.mode === 'simulation' ? 'Atendimento manual · bot desligado' : remaining ? `Janela de resposta: até ${remaining}h` : 'Janela fechada · use template aprovado';
}
async function submitMessage() {
  const id = selectedId; const kind = $('#message-kind').value; const body = kind === 'template' ? $('#template-name').value : $('#message-body').value.trim();
  if (!body) throw new Error(kind === 'template' ? 'Nenhum template aprovado configurado.' : 'Escreva uma mensagem.');
  // Uma falha de rede preserva a chave: clicar novamente consulta o mesmo envio.
  const key = JSON.stringify([id, kind, body]);
  if (!pendingRequests.has(key)) pendingRequests.set(key, { body, kind, requestKey: crypto.randomUUID() });
  sending.add(id);
  $('#send-button').disabled = true;
  try {
    const result = await api(`/api/leads/${id}/messages`, { method: 'POST', body: JSON.stringify(pendingRequests.get(key)) });
    if (drafts.get(id)?.body.trim() === body) drafts.set(id, { ...drafts.get(id), body: '' });
    if (selectedId === id && $('#message-body')?.value.trim() === body) $('#message-body').value = '';
    pendingRequests.delete(key);
    toast(statuses[result.status] || result.status);
    await refresh(false); if (view === 'inbox' && selectedId === id) await loadMessages(true);
  } finally { sending.delete(id); if ($('#send-button')) $('#send-button').disabled = sending.has(selectedId) || !!state.leads.find(l => l.id === selectedId)?.doNotContact || state.integration.mode === 'blocked'; }
}
function renderMetrics() {
  const m = state.metrics;
  const table = (title, rows) => `<div class="panel"><h2>${title}</h2><table><thead><tr><th>GRUPO</th><th>LEADS</th><th>CLIENTES</th><th>CONVERSÃO</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escape(r.name)}</td><td>${r.total}</td><td>${r.clients}</td><td>${Math.round(r.conversion * 100)}%</td></tr>`).join('') || '<tr><td colspan="4">Nenhum dado disponível.</td></tr>'}</tbody></table></div>`;
  $('#content').innerHTML = `${metricsCards()}<div class="insight-grid"><div class="panel"><h2>Distribuição do pipeline</h2>${m.stages.map(s => `<div class="bar-row"><span>${escape(s.name)}</span><progress max="${Math.max(m.total, 1)}" value="${s.total}" aria-label="${escape(s.name)}"></progress><strong>${s.total}</strong></div>`).join('')}</div><div class="panel"><span class="eyebrow">COMO LER OS RESULTADOS</span><h2>Progresso que pode ser conferido.</h2><p class="muted">A taxa de resposta considera os leads com envio real aceito pela Meta que também têm mensagem real recebida. Simulações não entram nesse cálculo.</p><p class="muted">A conversão por segmento e cidade é a proporção de leads marcados como Cliente sobre o total do grupo. As etapas são atualizadas manualmente.</p><p class="muted">Qualificação A: score 9–10. B: 7–8. C: 0–6. O score é uma hipótese de prioridade, a ser revisada ao conhecer a empresa.</p></div>${table('Conversão por segmento', m.segments)}${table('Conversão por cidade', m.cities)}</div>`;
}
function renderIntegration() {
  $('#content').innerHTML = `<div class="integration-hero"><span class="eyebrow">INTEGRAÇÃO OFICIAL · META CLOUD API</span><h2>Preparado para conectar.<br>Isolado para trabalhar.</h2><p>${escape(state.integration.message)} O CRM guarda seus próprios leads e conversas. A ativação do número compartilhado depende da revisão da proposta de roteamento.</p></div><div class="insight-grid"><div class="panel"><h2>Proposta de roteamento compartilhado</h2><div class="architecture"><span>WhatsApp / Meta</span><b>→</b><span>Roteador por contato</span><b>→</b><span>Prospecta ou Coleus</span></div><div class="steps"><div class="step"><div><h3>Um responsável por conversa</h3><p>A combinação do ID do número e telefone identifica o projeto responsável. Leads de software seguem exclusivamente para este CRM.</p></div></div><div class="step"><div><h3>Conflitos ficam para revisão</h3><p>Se um contato pertencer aos dois projetos, a decisão é humana. Um evento não deve ser entregue aos dois bots.</p></div></div><div class="step"><div><h3>Validação antes da mudança</h3><p>Testar duplicatas, lotes mistos e falhas de entrega; só depois planejar a alteração do callback e a volta à configuração anterior.</p></div></div></div></div><div class="panel"><h2>O que funciona nesta versão</h2><p class="muted">Cadastro e importação JSON, qualificação, tags, observações, pipeline, histórico, indicadores de leitura e simulação de atendimento manual.</p><h3>Conexão real preparada</h3><p class="muted">Webhook com assinatura HMAC, identificação do remetente, deduplicação persistente, estados de entrega e envio manual de texto ou template sem variáveis.</p><h3>Ativação compartilhada pendente</h3><p class="muted">Esta versão bloqueia o número compartilhado. O roteador está documentado para revisão e ainda não foi implantado. Credenciais e callback da Casa dos Coleus não foram alterados.</p><h3>Bot do Prospecta</h3><p class="muted">Desligado. Não há motor de respostas automáticas neste MVP.</p></div></div>`;
}
function openLead(id) {
  const form = $('#lead-form'); form.reset();
  const lead = state.leads.find(l => l.id === id);
  $('#form-stage').innerHTML = stageOptions(lead?.stage || state.stages[0]);
  $('#lead-form-title').textContent = lead ? 'Contexto do lead' : 'Novo lead';
  form.elements.id.value = id || '';
  form.dataset.revision = lead?.updatedAt || '';
  form.elements.phone.readOnly = !!id;
  if (lead) for (const key of ['company', 'phone', 'segment', 'city', 'source', 'score', 'notes', 'optInEvidence']) form.elements[key].value = lead[key];
  form.elements.tags.value = lead?.tags.join(', ') || '';
  form.elements.optIn.checked = lead?.optIn || false;
  form.elements.doNotContact.checked = lead?.doNotContact || false;
  $('#lead-dialog').showModal();
}
$('#lead-form').addEventListener('submit', event => { event.preventDefault(); guarded(async () => {
  const form = event.target; const data = Object.fromEntries(new FormData(form)); const id = data.id; delete data.id;
  data.score = Number(data.score); data.tags = data.tags.split(',').map(t => t.trim()).filter(Boolean); data.optIn = form.elements.optIn.checked; data.doNotContact = form.elements.doNotContact.checked;
  if (id) data.expectedUpdatedAt = Number(form.dataset.revision);
  const button = form.querySelector('[type=submit]'); button.disabled = true;
  try { await api(`/api/leads${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) }); $('#lead-dialog').close(); await refresh(); toast('Lead salvo.'); }
  finally { button.disabled = false; }
}); });
$('#close-dialog').addEventListener('click', () => $('#lead-dialog').close());
$('#new-lead').addEventListener('click', () => openLead());
$('#refresh').addEventListener('click', () => guarded(() => refresh()));
document.addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  if (target.dataset.view) location.hash = target.dataset.view;
  if (target.dataset.edit) openLead(target.dataset.edit);
  if (target.dataset.chat) { selectedId = target.dataset.chat; if (view === 'inbox') renderInbox(); else location.hash = 'inbox'; }
  if (target.dataset.action === 'go-leads') location.hash = 'leads';
  if (target.dataset.action === 'import') $('#import-file').click();
  if (target.dataset.action === 'import-context') guarded(async () => { target.disabled = true; try { const result = await api('/api/leads/import-context', { method: 'POST', body: '{}' }); await refresh(); toast(`${result.imported} leads importados. ${result.skipped} já existiam.`); } finally { target.disabled = false; } });
  if (target.dataset.action === 'export') guarded(async () => { const data = await api('/api/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'prospecta-export.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
});
document.addEventListener('change', event => { if (event.target.dataset.stage) guarded(async () => { try { await api(`/api/leads/${event.target.dataset.stage}`, { method: 'PATCH', body: JSON.stringify({ stage: event.target.value, expectedUpdatedAt: state.leads.find(l => l.id === event.target.dataset.stage)?.updatedAt }) }); toast('Etapa atualizada.'); } finally { await refresh(); } }); });
$('#import-file').addEventListener('change', event => guarded(async () => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 900000) throw new Error('Use um JSON de até 900 KB.'); const data = JSON.parse(await file.text()); const result = await api('/api/leads/import', { method: 'POST', body: JSON.stringify(Array.isArray(data) ? data : data.leads) }); await refresh(); toast(`${result.imported} importados; ${result.skipped} já existentes.`); }
  finally { event.target.value = ''; }
}));
$('#login-dialog').addEventListener('cancel', event => event.preventDefault());
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.target.querySelector('[type=submit]'); button.disabled = true; $('#login-error').textContent = '';
  try { const result = await api('/api/session', { method: 'POST', body: JSON.stringify({ username: $('#login-username').value, password: $('#login-password').value }) }); $('#login-password').value = ''; await unlockScreen(result); }
  catch (error) { $('#login-error').textContent = error.message; } finally { button.disabled = false; }
});
$('#logout').addEventListener('click', () => guarded(async () => { await api('/api/session', { method: 'DELETE' }); lockScreen(); }));
$('#change-password').addEventListener('click', () => { $('#password-description').textContent = 'Atualize a senha usada para entrar na sua conta.'; $('#password-dialog').showModal(); });
$('#password-dialog').addEventListener('cancel', event => { if (currentUser?.mustChangePassword) event.preventDefault(); });
$('#password-cancel').addEventListener('click', () => { if (currentUser?.mustChangePassword) $('#logout').click(); else $('#password-dialog').close(); });
$('#password-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.target.querySelector('[type=submit]'); button.disabled = true; $('#password-error').textContent = '';
  try {
    if ($('#new-password').value !== $('#confirm-password').value) throw new Error('A confirmação deve ser igual à nova senha.');
    const result = await api('/api/account/password', { method: 'POST', body: JSON.stringify({ currentPassword: $('#current-password').value, newPassword: $('#new-password').value }) });
    event.target.reset(); $('#password-dialog').close(); await unlockScreen(result); toast('Senha atualizada. As outras sessões desta conta foram encerradas.');
  } catch (error) { $('#password-error').textContent = error.message; } finally { button.disabled = false; }
});
window.addEventListener('hashchange', () => { view = Object.hasOwn(titles, location.hash.slice(1)) ? location.hash.slice(1) : 'leads'; renderView(); });
view = Object.hasOwn(titles, location.hash.slice(1)) ? location.hash.slice(1) : 'leads';
(async () => { try { await unlockScreen(await api('/api/session')); } catch { lockScreen(); } })();
setInterval(() => {
  if (view !== 'inbox' || document.hidden || polling || !selectedId || !csrf || $('#lead-dialog').open || $('#login-dialog').open) return;
  polling = true;
  guarded(async () => { try { await loadMessages(); await refresh(false); } finally { polling = false; } });
}, 5000);
