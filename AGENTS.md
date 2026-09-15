# Prospecta Hub — instruções de desenvolvimento

Leia `PROJECT_CONTEXT.md` e `SKILLS.md`. Trabalhe na raiz deste projeto.

## Limites deste workspace

- Casa dos Coleus é referência de leitura; não alterar seus arquivos, dados, processos, credenciais, Git, configuração Meta ou deploy por efeito de uma tarefa deste CRM.
- Não importar seus módulos por caminho, compartilhar dados/volumes, inicializar submódulo ou reutilizar seu histórico Git. Adaptar contratos pequenos e documentar a origem.
- O número compartilhado permanece bloqueado até aprovação e implementação do roteamento. A proposta está em `docs/PROPOSTA_ROTEAMENTO_COMPARTILHADO.md`.
- Não enviar mensagens reais como parte de teste de desenvolvimento. Use transporte injetado e contatos fictícios.
- Segredos somente em ambiente próprio; variáveis `PROSPECTA_*`. Não exibir valores em logs/diffs/docs.

## Fluxo adaptado do dev-workflow-kit

1. Implementação com `senior-dev`, mantendo Node nativo e escopo pequeno.
2. Revisão com `.agents/skills/code-reviewer/SKILL.md`.
3. Análise de impacto com `.agents/skills/qa-senior/SKILL.md`.
4. Automação pertinente com `.agents/skills/qa-automate/SKILL.md`; rodar `test.cmd` e `npm.cmd run check`.
5. Rever diff e documentar limitações. Os papéis podem ser executados na mesma sessão; delegar quando autorizado e útil.

Mudanças Meta ou de roteamento também usam `.agents/skills/prospecta-meta-isolation/SKILL.md`. Alterações de UI devem preservar responsividade, acessibilidade, estados vazios e rótulos de simulação; skills de redesign são opcionais quando pertinentes ao pedido.

## Git e validação

Trabalhar em `develop`, preservar alterações existentes e revisar arquivos explicitamente. Remote autorizado: `git@github.com:vinnitog/prospecta-hub.git`. Fluxo: develop → PR → main; Pages somente pela main. Push/deploy e envio externo dependem do escopo autorizado da tarefa. `npm.cmd` evita bloqueio de ExecutionPolicy no Windows.

Usar testes locais sem serviços externos. Não tornar tokens reais pré-requisito da suíte. Não confundir stub de Meta com validação da conta real. Banco em `data/` é ignorado pelo Git.

Antes de commit/push, executar `node scripts/check-public-repo.js` e verificar o diff. Dados reais, senhas, hashes reais e arquivos privados nunca entram no Git. Pages publica somente o portal estático `pages/`. Login exige backend privado; não criar autenticação apenas no JavaScript público.
