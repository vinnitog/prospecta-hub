# Prospecta Hub

CRM gratuito, sem login, com dados privados salvos no seu dispositivo e código-fonte público.

## Usar no GitHub Pages

Abra https://vinnitog.github.io/prospecta-hub/. Cadastre leads ou use **Importar JSON** para carregar seu arquivo privado. Leads, pipeline, observações e conversas ficam no armazenamento local do navegador. A aplicação não envia sua carteira, notas ou conversas ao GitHub nem à fonte de busca.

Use **Exportar** para salvar um backup privado de leads e histórico. No navegador, **Importar JSON** também restaura o histórico do backup sem duplicar mensagens; leads já existentes não são sobrescritos. Para enviar a base ao sócio, compartilhe o arquivo por um canal privado e importe no navegador dele.

Não há sincronização entre pessoas, navegadores ou computadores. Quem usar o mesmo perfil de navegador terá acesso aos dados. Limpar os dados do site, usar navegação anônima ou perder o dispositivo pode apagar a base; faça backups. As gravações de duas abas são coordenadas e formulários antigos são recusados para evitar sobrescritas.

## Buscar leads

Na tela **Leads**, clique em **Buscar leads**, ajuste cidade/UF e segmentos e escolha **Buscar e importar**. A seleção inicial é Marília/SP com ferragens/ferramentas, construção, elétricos, autopeças, agropecuária, pet/rações e embalagens, o perfil de comércio com estoque físico do projeto.

A busca usa [OpenStreetMap](https://www.openstreetmap.org/copyright) pela [Overpass Private.coffee](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances), uma fonte pública sem chave. O [IBGE](https://servicodados.ibge.gov.br/api/docs/localidades) identifica o município pela UF e pelo nome, evitando homônimos e buscas geográficas lentas. Somente cidade, UF e segmentos são enviados ao serviço; sua carteira permanece local. A cobertura depende dos cadastros no mapa e não substitui pesquisa manual em outras fontes.

Importa até 50 novos contatos com telefone brasileiro válido por operação, preservando cadastros já existentes. Se houver mais resultados, repita para o próximo lote. Cada lead registra a fonte, a atribuição ODbL e a qualificação pendente; score é uma hipótese pelo segmento, sem inferir que a empresa usa Windows, precisa comprar software ou autorizou contato.

Sem telefone válido, o registro é ignorado; erros/limites da fonte aparecem na tela. Fechar a busca cancela a consulta em andamento. Há cache de cinco minutos e intervalo de um minuto entre consultas externas, sem tentativas automáticas nem rotação de servidores. Nada é enviado ao WhatsApp.

## Usar o banco local existente

Requer Node.js 24.12+. Sem instalação de dependências:

```powershell
.\start.cmd
```

Abra http://127.0.0.1:4317/. Sem tela de login; sessão técnica automática mantém validação de origem/Host/CSRF. O servidor aceita somente loopback, sem exposição à rede. O banco existente em `data/prospecta.sqlite` é preservado. As antigas contas deixam de ser usadas; nenhum cadastro ou senha é exigido.

Os armazenamentos do Pages e do servidor local são diferentes. Para migrar a carteira, exporte pelo CRM local e importe no Pages. O SQLite continua sendo a cópia original; o backup JSON permite transferir leads e mensagens ao navegador.

## O que é publicado

Somente código-fonte e instruções. `data/`, `private/`, `output/`, backups, exports, bancos e `.env` ficam fora do Git. O artefato do Pages contém somente `index.html`, `styles.css`, `app.js`, `domain.js`, `browser-store.js`, `lead-search.js` e `lead-search-ui.js`. Nenhuma lista real de leads ou credencial é incluída. A política de conteúdo permite somente a consulta aos endpoints de municípios e busca; nenhuma chave é necessária.

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
