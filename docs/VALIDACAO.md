# Validação — versão gratuita sem login

37 testes passaram: 23 de CRM/backend/integração isolada, 6 de armazenamento no navegador e 8 de busca/importação. Os testes novos cobrem persistência após recriar a instância, backup de leads e histórico sem duplicação, importação atômica, falha de quota sem perda anterior, coordenação entre abas, edição obsoleta, não contatar e base corrompida.

O servidor local abre sem credenciais, mantém a sessão técnica com CSRF/Host/origem e rejeita configuração de exposição fora de loopback. As rotas antigas de login e senha não estão ativas. O banco existente foi preservado.

O Pages publica sete arquivos estáticos explícitos, sem lista inicial real ou cookies de login. Seu CSP permite somente a consulta de municípios do IBGE e a busca pública na Overpass Private.coffee, com cidade/UF/segmentos; a carteira não é transmitida. O armazenamento é local por navegador, sem sincronização com o sócio; backups são necessários.

Os testes não enviam WhatsApp real. Nenhum arquivo, processo, configuração ou deploy da Casa dos Coleus foi alterado. A integração compartilhada continua bloqueada. A alteração usa revisão e QA sequenciais na sessão.

## Buscar leads

Oito testes novos cobrem filtros e injeção de consulta, normalização de telefone, segmentação/procedência, cache/limites de rede, importação com preservação de opt-out, lotes seguintes no SQLite, cancelamento e erro parcial. Fonte externa injetada nos testes; nenhum contato real ou token entra nas fixtures. A consulta real é uma verificação separada da disponibilidade e cobertura atual, sem envio de mensagens.

Validação real em 15/09/2026, em navegador de teste: busca de Marília/SP importou 10 contatos e ignorou 7 empresas do perfil sem telefone válido; repetir importou zero e reconheceu os 10 existentes. A recarga preservou os registros. Nenhum dado dessa consulta foi gravado nos arquivos publicáveis. Formulário verificado em 390 px e desktop, sem erros de console. A fonte comunitária apresentou demora em algumas consultas; timeout e respostas incompletas não alteraram a base.
