# Validação — versão gratuita sem login

29 testes passaram: 23 de CRM/backend/integração isolada e 6 de armazenamento no navegador. Os testes novos cobrem persistência após recriar a instância, backup de leads e histórico sem duplicação, importação atômica, falha de quota sem perda anterior, coordenação entre abas, edição obsoleta, não contatar e base corrompida.

O servidor local abre sem credenciais, mantém a sessão técnica com CSRF/Host/origem e rejeita configuração de exposição fora de loopback. As rotas antigas de login e senha não estão ativas. O banco existente foi preservado.

O Pages publica cinco arquivos estáticos explícitos, sem lista inicial real, cookies de login ou chamadas de API. Seu CSP bloqueia conexões de dados (`connect-src none`). O armazenamento é local por navegador, sem sincronização com o sócio; backups são necessários.

Os testes não enviam WhatsApp real. Nenhum arquivo, processo, configuração ou deploy da Casa dos Coleus foi alterado. A integração compartilhada continua bloqueada. A alteração usa revisão e QA sequenciais na sessão.
