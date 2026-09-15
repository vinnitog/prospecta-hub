# Prospecta Hub — contexto

## Pedido e limites

O proprietário pediu para aproveitar a integração existente com seu número virtual e a Meta Cloud API, preservando o Casa dos Coleus, ainda em negociação. Autorizou estruturar este projeto e adaptar as skills do dev-workflow-kit. Escolheu preparar uma proposta de roteamento compartilhado para revisão antes de ativar.

O HTML anexado foi tratado como contexto funcional e fonte dos 15 leads, não como autorização independente para enviar mensagens ou alterar contas/projetos.

## Produto

CRM de prospecção de software de estoque para Windows/offline. Primeira região: Marília-SP. Prioridade: organizar leads, acompanhar conversas manuais e registrar evolução até cliente ou encerramento. Scores e telefones do documento ainda não foram verificados. Telefone público não implica autorização para abordagem.

## Decisões

- Node.js 24.12+, HTTP/fetch/crypto e SQLite nativos; HTML/CSS/JS sem framework. Stack próxima ao Coleus, com persistência independente. Zero dependências npm.
- Dados apenas em `data/prospecta.sqlite`. Nenhum import ou referência de runtime ao outro projeto.
- Modo inicial de simulação explícito. Simulações não contam como contatos ou respostas reais, não mudam etapa e não abrem janela de 24h.
- Remetente compartilhado bloqueado por código. Habilitar exige trabalho futuro aprovado de roteamento e testes cruzados.
- Apenas leads cadastrados recebem eventos. Números desconhecidos e outros IDs de remetente são ignorados neste adaptador; no futuro roteador, terão uma política própria de encaminhamento/quarentena.
- Normalização de telefone remove máscara, mas não adivinha DDI ou nono dígito. Importação do documento prefixa 55 porque os telefones são brasileiros. Verificar correspondência exata com `wa_id` antes do piloto.
- Uma conversa manual por lead; sem automação. Preferência de não contatar bloqueia os envios.
- Sem deploy, alteração de callback, assinatura de WABA, alteração de catálogo ou registro/migração do número nesta etapa.

## Validação

Execute `test.cmd` e `npm.cmd run check`. Consulte `docs/VALIDACAO.md` para evidências e limitações. Testes nunca usam credenciais reais.

## Acessos e publicação do código

O proprietário autorizou dois acessos individuais, commit/push para `git@github.com:vinnitog/prospecta-hub.git`, branches `develop` e `main` e configuração do GitHub Pages. Código pode ser público; contatos, mensagens, senhas, hashes reais e banco são privados.

Autenticação local automática e token compartilhado foram substituídos por usuário/senha. O portal do Pages é independente do servidor e não recebe dados do CRM. A hospedagem remota do backend ainda depende da escolha do provedor. Nunca usar a infraestrutura do projeto de referência por inferência.
