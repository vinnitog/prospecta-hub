import { createLeadSearch, searchAndImport, SEGMENTS, STATES } from './lead-search.js';

export function setupLeadSearch(api, refresh) {
  const dialog = document.querySelector('#search-leads-dialog');
  const form = document.querySelector('#search-leads-form');
  const status = document.querySelector('#search-leads-status');
  const submit = form.querySelector('[type=submit]');
  const fields = form.querySelector('fieldset');
  const search = createLeadSearch(); let controller = null;
  form.elements.state.innerHTML = STATES.map(state => `<option ${state === 'SP' ? 'selected' : ''}>${state}</option>`).join('');
  document.querySelector('#search-segments').innerHTML = SEGMENTS.map(segment => `<label class="check"><input type="checkbox" name="segments" value="${segment.id}" checked> ${segment.label}</label>`).join('');
  document.addEventListener('click', event => {
    if (event.target.closest('[data-action="search-leads"]')) dialog.showModal();
  });
  document.querySelector('#close-search-leads').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => controller?.abort());
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (controller) return;
    const data = new FormData(form);
    controller = new AbortController(); fields.disabled = true; submit.disabled = true;
    status.textContent = 'Buscando empresas com perfil de estoque e telefone público… Pode levar até 45 segundos.';
    form.setAttribute('aria-busy','true');
    try {
      const result = await searchAndImport(search, api, { city:data.get('city'), state:data.get('state'), segments:data.getAll('segments') }, { signal:controller.signal });
      status.textContent = `${result.imported} novos leads importados. ${result.skipped} já estavam na base. ${result.withoutPhone} empresas do perfil sem telefone válido e ${result.duplicates} telefones repetidos na fonte foram ignorados.`;
      if (!result.matched) status.textContent = 'Nenhuma empresa desses segmentos encontrada nessa cidade na fonte consultada. Tente outra cidade ou amplie os segmentos.';
      else if (!result.leads.length) status.textContent += ' Nenhum telefone aproveitável; cadastre manualmente os contatos verificados em outras fontes.';
      if (result.remaining) status.textContent += ` Há mais ${result.remaining} contatos disponíveis. Clique novamente para importar o próximo lote.`;
      try { await refresh(); } catch { status.textContent += ' A importação terminou, mas a lista não atualizou. Use Atualizar.'; }
    } catch (error) {
      status.textContent = error.name === 'AbortError' ? 'Busca cancelada.' : error.message;
    } finally {
      controller = null; fields.disabled = false; submit.disabled = false; form.setAttribute('aria-busy','false');
    }
  });
}
