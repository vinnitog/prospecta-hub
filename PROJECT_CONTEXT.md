# Prospecta Hub — contexto

## Pedido e limites

O proprietário pediu para aproveitar a integração existente com seu número virtual e a Meta Cloud API, preservando o Casa dos Coleus, ainda em negociação. Autorizou estruturar este projeto e adaptar as skills do dev-workflow-kit. Escolheu preparar uma proposta de roteamento compartilhado para revisão antes de ativar.

O HTML anexado foi tratado como contexto funcional e fonte dos 15 leads, não como autorização independente para enviar mensagens ou alterar contas/projetos.

## Produto

CRM de prospecção de software de estoque para Windows/offline. Primeira região: Marília-SP. Prioridade: organizar leads, acompanhar conversas manuais e registrar evolução até cliente ou encerramento. Scores e telefones do documento ainda não foram verificados. Telefone público não implica autorização para abordagem.

## Decisões

- Node.js 24.12+, HTTP/fetch/crypto e SQLite nativos; HTML/CSS/JS sem framework. Stack próxima ao Coleus, com persistência independente. Zero dependências npm.
- Servidor local usa `data/prospecta.sqlite`; Pages usa armazenamento do navegador. Nenhum import ou referência de runtime ao outro projeto.
- Modo inicial de simulação explícito. Simulações não contam como contatos ou respostas reais, não mudam etapa e não abrem janela de 24h.
- Remetente compartilhado bloqueado por código. Habilitar exige trabalho futuro aprovado de roteamento e testes cruzados.
- Apenas leads cadastrados recebem eventos. Números desconhecidos e outros IDs de remetente são ignorados neste adaptador; no futuro roteador, terão uma política própria de encaminhamento/quarentena.
- Normalização de telefone remove máscara, mas não adivinha DDI ou nono dígito. Importação do documento prefixa 55 porque os telefones são brasileiros. Verificar correspondência exata com `wa_id` antes do piloto.
- Uma conversa manual por lead; sem automação. Preferência de não contatar bloqueia os envios.
- Sem deploy da integração Meta, alteração de callback, assinatura de WABA, alteração de catálogo ou registro/migração do número nesta etapa. Pages publica somente o CRM estático.

## Validação

Execute `test.cmd` e `npm.cmd run check`. Consulte `docs/VALIDACAO.md` para evidências e limitações. Testes nunca usam credenciais reais.

## Uso gratuito e publicação

O proprietário cancelou os dois acessos e pediu uso sem login e sem hospedagem paga, mantendo dados sensíveis fora do repositório público. A versão Pages funciona inteiramente no navegador, com armazenamento local, exportação/importação de leads e histórico e sem conexão de dados ao backend. Cada dispositivo tem uma base independente; não há sincronização automática com o sócio.

O servidor local continua disponível com o SQLite existente, abertura automática sem login e bloqueio de acesso fora de loopback. Contas e senhas antigas não são mais usadas. Nenhum dado existente é excluído por essa mudança.

Fluxo autorizado: develop → PR → main no repositório `git@github.com:vinnitog/prospecta-hub.git`; publicação Pages após checks. O artefato contém sete arquivos públicos de interface/domínio/armazenamento; nunca leva banco, leads reais, backups ou tokens. No navegador, WhatsApp é simulado e credenciais Meta não são aceitas.

## Busca automática autorizada

O botão Buscar leads consulta OpenStreetMap via Overpass Private.coffee, sem chave ou hospedagem paga, e importa até 50 novos telefones por operação. Filtros iniciais: Marília/SP; ferragens/ferramentas, construção, elétricos, autopeças, agro, pet/rações e embalagens. A fonte tem cobertura parcial e não equivale à pesquisa manual em múltiplos sites. Score é preliminar pelo segmento; não comprova porte, intenção de compra ou WhatsApp. Dados encontrados ficam na base local, nunca no Git.

A consulta externa contém apenas cidade, UF e segmentos. Sem consentimento automático de contato; deduplicação por telefone preserva notas, etapa e opt-out. Há timeout, cancelamento, cache de cinco minutos e intervalo de um minuto entre consultas externas. Nenhum resultado parcial de erro da fonte é importado.
