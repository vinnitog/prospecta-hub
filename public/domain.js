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
export function validateLead(input, existing = {}) {
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
