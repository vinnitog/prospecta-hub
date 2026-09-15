# Prospecta Hub

CRM gratuito, sem login, com dados privados salvos no seu dispositivo e código-fonte público.

## Usar no GitHub Pages

Abra https://vinnitog.github.io/prospecta-hub/. Cadastre leads ou use **Importar JSON** para carregar seu arquivo privado. Leads, pipeline, observações e conversas ficam no armazenamento local do navegador. A aplicação não envia esses dados ao GitHub nem a uma API externa.

Use **Exportar** para salvar um backup privado de leads e histórico. No navegador, **Importar JSON** também restaura o histórico do backup sem duplicar mensagens; leads já existentes não são sobrescritos. Para enviar a base ao sócio, compartilhe o arquivo por um canal privado e importe no navegador dele.

Não há sincronização entre pessoas, navegadores ou computadores. Quem usar o mesmo perfil de navegador terá acesso aos dados. Limpar os dados do site, usar navegação anônima ou perder o dispositivo pode apagar a base; faça backups. As gravações de duas abas são coordenadas e formulários antigos são recusados para evitar sobrescritas.

## Usar o banco local existente

Requer Node.js 24.12+. Sem instalação de dependências:

```powershell
.\start.cmd
```

Abra http://127.0.0.1:4317/. Sem tela de login; sessão técnica automática mantém validação de origem/Host/CSRF. O servidor aceita somente loopback, sem exposição à rede. O banco existente em `data/prospecta.sqlite` é preservado. As antigas contas deixam de ser usadas; nenhum cadastro ou senha é exigido.

Os armazenamentos do Pages e do servidor local são diferentes. Para migrar a carteira, exporte pelo CRM local e importe no Pages. O SQLite continua sendo a cópia original; o backup JSON permite transferir leads e mensagens ao navegador.

## O que é publicado

Somente código-fonte e instruções. `data/`, `private/`, `output/`, backups, exports, bancos e `.env` ficam fora do Git. O artefato do Pages contém somente `index.html`, `styles.css`, `app.js`, `domain.js` e `browser-store.js`. Nenhuma lista real de leads ou credencial é incluída. A política de conteúdo do Pages bloqueia conexões iniciadas pelo aplicativo.

O código público já contém exemplos estritamente fictícios nos testes. A auditoria automatizada procura arquivos privados e padrões conhecidos de segredo; revisar o diff continua obrigatório.

## WhatsApp

No Pages, inbox e respostas são apenas simulações locais. Não há webhook nem envio real pela Meta no navegador. Nunca colocar token/app secret em arquivos públicos. A integração do outro projeto permanece preservada; seu número compartilhado continua bloqueado no adaptador local até a solução de roteamento aprovada.

## Desenvolvimento

Trabalhar em `develop`, abrir PR para `main` e aguardar os checks antes de integrar. Pages publica somente da `main`.

```powershell
.\test.cmd
npm.cmd run check
node scripts/check-public-repo.js
node scripts/build-pages.js
```

Os testes usam dados fictícios, armazenamento de teste e transporte Meta simulado. O backend local não exige login; a versão Pages não exige backend, conta ou mensalidade de hospedagem.
