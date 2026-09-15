import path from 'node:path';

export function readConfig(env = process.env) {
  const port = Number(env.PORT || 4317);
  const host = env.HOST || '127.0.0.1';
  const origin = env.PROSPECTA_ORIGIN || `http://127.0.0.1:${port}`;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
  const parsed = new URL(origin);
  if (parsed.origin !== origin) throw new Error('PROSPECTA_ORIGIN deve conter somente a origem, sem barra final.');
  const localOnly = host === '127.0.0.1' && parsed.hostname === '127.0.0.1' && parsed.protocol === 'http:';
  if (!localOnly && parsed.protocol !== 'https:') {
    throw new Error('Acesso em rede exige origem HTTPS.');
  }
  return {
    host, port, origin,
    contextPath: path.resolve(env.PROSPECTA_CONTEXT_PATH || './private/leads-contexto.json'),
    dbPath: path.resolve(env.PROSPECTA_DB_PATH || './data/prospecta.sqlite'),
    whatsapp: {
      mode: env.PROSPECTA_WHATSAPP_MODE || 'simulation',
      topology: env.PROSPECTA_WHATSAPP_TOPOLOGY || 'shared',
      accessToken: env.PROSPECTA_WHATSAPP_ACCESS_TOKEN || '',
      phoneNumberId: env.PROSPECTA_WHATSAPP_PHONE_NUMBER_ID || '',
      protectedPhoneNumberId: env.PROSPECTA_COLEUS_PHONE_NUMBER_ID || '',
      apiVersion: env.PROSPECTA_WHATSAPP_API_VERSION || '',
      verifyToken: env.PROSPECTA_WHATSAPP_VERIFY_TOKEN || '',
      appSecret: env.PROSPECTA_WHATSAPP_APP_SECRET || '',
      templates: (env.PROSPECTA_WHATSAPP_TEMPLATES || '').split(',').map(s => s.trim()).filter(Boolean),
      templateLanguage: env.PROSPECTA_WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR',
    },
  };
}
