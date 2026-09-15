import { validateLead } from './domain.js';

export const CITY_ENDPOINT = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados/';
export const SEARCH_ENDPOINT = 'https://overpass.private.coffee/api/interpreter';
export const STATES = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
export const SEGMENTS = [
  { id: 'hardware', label: 'Ferragens e ferramentas', shops: ['hardware', 'doityourself'], words: 'ferragen|ferramenta', score: 8 },
  { id: 'construction', label: 'Materiais de construção', shops: ['building_materials', 'paint', 'tiles'], words: 'constru[cç][aã]o|material.*constru', score: 8 },
  { id: 'electrical', label: 'Materiais elétricos', shops: ['electrical', 'lighting'], words: 'materia[il].*el[eé]tric', score: 8 },
  { id: 'parts', label: 'Autopeças', shops: ['car_parts', 'motorcycle_parts'], words: 'auto.?pe[cç]a|moto.?pe[cç]a', score: 8 },
  { id: 'agro', label: 'Agropecuária', shops: ['agrarian', 'farm_supplies'], words: 'agropecu[aá]ria|agro.?pet|casa.*ra[cç][aã]o', score: 8 },
  { id: 'pet', label: 'Pet e rações', shops: ['pet'], words: 'pet.?shop|ra[cç][oõ]es', score: 7 },
  { id: 'packaging', label: 'Embalagens', shops: ['packaging'], words: 'embalage', score: 8 },
];
const MAX_IMPORT = 50;
const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function searchFilters(input = {}) {
  const city = typeof input.city === 'string' ? input.city.trim().normalize('NFC') : '';
  if (city.length < 2 || city.length > 80 || !/^[\p{L} '-]+$/u.test(city)) throw new Error('Informe uma cidade brasileira, sem números ou símbolos.');
  if (!STATES.includes(input.state)) throw new Error('Escolha uma UF válida.');
  if (!Array.isArray(input.segments) || !input.segments.length || input.segments.some(id => !SEGMENTS.some(s => s.id === id))) throw new Error('Escolha ao menos um segmento da lista.');
  return { city, state: input.state, segments: [...new Set(input.segments)] };
}
export function buildQuery(input, municipalityId) {
  const filters = searchFilters(input); const segments = SEGMENTS.filter(s => filters.segments.includes(s.id));
  if (!/^\d{7}$/.test(String(municipalityId))) throw new Error('Identificador de município inválido.');
  const shops = segments.flatMap(s => s.shops).join('|'); const words = segments.map(s => s.words).join('|');
  // O código oficial evita varrer limites de cidades pelo nome e confundir municípios homônimos.
  return `[out:json][timeout:30][maxsize:134217728];area["IBGE:GEOCODIGO"="${municipalityId}"]->.city;.city out tags;(nwr(area.city)["shop"~"^(${shops})$"]["name"];nwr(area.city)["shop"]["name"~"${words}",i];);out tags;`;
}
export function brazilianPhone(value) {
  if (typeof value !== 'string') return null;
  for (const part of value.split(/[;,/]/)) {
    if (!/^[+\d\s().-]+$/.test(part.trim())) continue;
    if (part.trim().startsWith('+') && !part.trim().startsWith('+55')) continue;
    let digits = part.replace(/\D/g, '');
    if (digits.startsWith('0055')) digits = digits.slice(2);
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    // Sem adivinhar DDD, nono dígito ou interpretar um telefone estrangeiro como brasileiro.
    if (/^55[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(digits)) return digits;
  }
  return null;
}
export function parseSearchResults(data, input, municipalityId) {
  const filters = searchFilters(input);
  if (!data || !Array.isArray(data.elements) || data.remark || data.elements.length > 20000) throw new Error('A fonte não concluiu a busca. Nenhum contato foi importado; tente novamente mais tarde.');
  const cityArea = data.elements.find(e => e.type === 'area' && e.tags?.admin_level === '8' && (!municipalityId || e.tags['IBGE:GEOCODIGO'] === String(municipalityId)));
  if (!cityArea) throw new Error('Cidade não encontrada nessa UF. Confira o nome do município.');
  const segments = SEGMENTS.filter(s => filters.segments.includes(s.id)); const seen = new Set(); const leads = [];
  let matched = 0; let withoutPhone = 0; let duplicates = 0;
  for (const element of data.elements) {
    const tags = element?.tags;
    if (!['node', 'way', 'relation'].includes(element?.type) || !Number.isSafeInteger(element.id) || element.id <= 0 || !tags || typeof tags.name !== 'string' || !tags.name.trim() || !tags.shop) continue;
    if (['vacant', 'no', 'disused', 'closed'].includes(tags.shop) || tags.disused === 'yes' || tags.abandoned === 'yes') continue;
    const segment = segments.find(s => s.shops.includes(tags.shop)) || segments.find(s => new RegExp(s.words, 'i').test(tags.name));
    if (!segment) continue;
    matched++;
    const phone = ['contact:phone', 'phone', 'contact:mobile', 'mobile', 'contact:whatsapp'].map(key => brazilianPhone(tags[key])).find(Boolean);
    if (!phone) { withoutPhone++; continue; }
    if (seen.has(phone)) { duplicates++; continue; }
    seen.add(phone);
    const source = `https://www.openstreetmap.org/${element.type}/${element.id}`;
    const address = ['addr:street', 'addr:housenumber', 'addr:suburb'].map(k => typeof tags[k] === 'string' ? tags[k].slice(0,160) : '').filter(Boolean).join(', ');
    leads.push(validateLead({ company: tags.name.slice(0,160), phone, city: cityArea.tags.name || filters.city, segment: segment.label, source,
      score: segment.score, tags: ['Busca automática', 'Qualificação pendente'], optIn: false, doNotContact: false,
      notes: `Fonte: © colaboradores do OpenStreetMap (ODbL). ${source}\nConsulta: ${new Date().toISOString().slice(0,10)}.\n${address ? `Endereço informado: ${address}.\n` : ''}Perfil potencial para estoque Windows/offline pelo segmento. Score preliminar; porte, necessidade de software e WhatsApp não verificados. Telefone público não é autorização para contato.` }));
  }
  leads.sort((a,b) => b.score-a.score || a.company.localeCompare(b.company, 'pt-BR'));
  return { leads, matched, withoutPhone, duplicates };
}

export function createLeadSearch({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let active = false; let nextSearchAt = 0; const cache = new Map(); const municipalities = new Map();
  return async (input, { signal } = {}) => {
    const filters = searchFilters(input); const key = JSON.stringify([fold(filters.city),filters.state,[...filters.segments].sort()]);
    if (active) throw new Error('Uma busca já está em andamento.');
    if (signal?.aborted) throw new DOMException('Busca cancelada.', 'AbortError');
    const cached = cache.get(key);
    if (cached && now() - cached.at < 300000) return structuredClone(cached.result);
    if (now() < nextSearchAt) throw new Error(`Aguarde ${Math.ceil((nextSearchAt-now())/1000)} segundos antes de outra busca.`);
    active = true; nextSearchAt = now() + 60000;
    try {
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000);
      let cities = municipalities.get(filters.state);
      if (!cities) {
        const cityResponse = await fetchImpl(`${CITY_ENDPOINT}${filters.state}/municipios`, { credentials:'omit', referrerPolicy:'origin', signal:requestSignal });
        if (!cityResponse.ok) throw new Error('A consulta de municípios está indisponível. Tente novamente mais tarde.');
        cities = await cityResponse.json();
        if (!Array.isArray(cities) || cities.length > 2000) throw new Error('Resposta de municípios inválida.');
        municipalities.set(filters.state,cities);
      }
      const city = cities.find(row => typeof row?.nome === 'string' && fold(row.nome) === fold(filters.city) && /^\d{7}$/.test(String(row.id)));
      if (!city) throw new Error('Cidade não encontrada nessa UF. Confira o nome do município.');
      const query = buildQuery(filters,city.id);
      const response = await fetchImpl(SEARCH_ENDPOINT, { method: 'POST', body: new URLSearchParams({ data: query }), credentials: 'omit', referrerPolicy: 'origin',
        signal: requestSignal });
      if (!response.ok) throw new Error([429,406].includes(response.status) ? 'A fonte limitou as consultas. Aguarde um minuto antes de tentar novamente.' : 'Fonte de busca indisponível. Tente novamente mais tarde.');
      const text = await response.text();
      if (text.length > 3000000) throw new Error('A busca retornou dados demais. Escolha menos segmentos.');
      let data; try { data = JSON.parse(text); } catch { throw new Error('A fonte retornou uma resposta inválida. Nenhum contato foi importado.'); }
      const result = parseSearchResults(data,filters,city.id);
      if (cache.size >= 5) cache.delete(cache.keys().next().value);
      cache.set(key,{at:now(),result}); return structuredClone(result);
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Busca cancelada.', 'AbortError');
      if (error.name === 'TimeoutError') throw new Error('A busca demorou demais. Tente novamente mais tarde.');
      if (error instanceof TypeError) throw new Error('Não foi possível acessar a fonte. Confira a conexão e tente novamente.');
      throw error;
    } finally { active = false; }
  };
}

export async function searchAndImport(search, api, filters, options = {}) {
  const result = await search(filters, options);
  if (options.signal?.aborted) throw new DOMException('Busca cancelada.', 'AbortError');
  const existing = new Set((await api('/api/state')).leads.map(l => l.phone));
  const fresh = result.leads.filter(l => !existing.has(l.phone));
  if (options.signal?.aborted) throw new DOMException('Busca cancelada.', 'AbortError');
  const imported = fresh.length ? await api('/api/leads/import', { method:'POST', body:JSON.stringify(fresh.slice(0,MAX_IMPORT)) }) : { imported:0, skipped:0 };
  return { ...result, remaining:Math.max(0,fresh.length-MAX_IMPORT), imported:imported.imported, skipped:result.leads.length-fresh.length+imported.skipped };
}
