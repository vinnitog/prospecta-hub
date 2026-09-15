# Prospecta Hub

CRM privado para uma equipe comercial, com código-fonte público. Node.js 24.12+, SQLite e interface web sem dependências npm.

## Executar

```powershell
npm.cmd run setup:users -- usuario1 usuario2
.\start.cmd
```

O comando cria duas contas distintas, sem sobrescrever usuários existentes. Senhas iniciais aleatórias ficam somente em um arquivo local dentro de `private/`, ignorado pelo Git. Cada usuário troca sua senha no primeiro login. Acesse http://127.0.0.1:4317.

As contas compartilham a carteira e a inbox da equipe. Login obrigatório em todos os ambientes; hashes scrypt no banco, cookies HttpOnly/SameSite, sessões de 8 horas, logout, CSRF e limitação de tentativas. A troca de senha revoga as outras sessões da mesma conta. Não há cadastro público. Edições de leads enviam a versão lida para evitar sobrescrever mudanças do sócio.

## Dados privados

`data/`, `private/`, `output/`, backups, exports, bancos e `.env` ficam fora do Git e do Pages. O repositório não inclui a lista real de leads. Importe contatos por JSON autenticado ou configure um arquivo privado via `PROSPECTA_CONTEXT_PATH`. Os contatos existentes permanecem no banco local, sem serem enviados ao GitHub.

Copie `.env.example` para `.env` se precisar configurar o ambiente. Para backup completo, pare o servidor e copie o banco SQLite para um local privado. O JSON exportado contém leads e histórico; a reimportação recupera somente leads, sem sobrescrever duplicatas.

## GitHub Pages e servidor

GitHub Pages publica somente o portal estático em `pages/`, montado por `scripts/build-pages.js`. Não executa Node/SQLite nem hospeda os dados do CRM. O portal não solicita senha.

Para acesso remoto dos dois usuários, hospede o servidor separadamente, com volume persistente, `HOST=0.0.0.0` e `PROSPECTA_ORIGIN` HTTPS. Crie as contas no banco desse servidor; não publique os arquivos locais de senha. Configure a variável do repositório `CRM_PUBLIC_URL` com o endereço HTTPS do CRM e execute o workflow **Publish Pages** para ativar o link no portal. Sem essa variável, o portal informa que o acesso está em configuração.

## Desenvolvimento e publicação

- Trabalho cotidiano em `develop`.
- Abrir PR de `develop` para `main` e revisar os checks antes de integrar.
- GitHub Pages publica a partir de `main` pelo GitHub Actions.
- O artefato contém somente `index.html` e `styles.css` do portal. Nunca publicar a raiz, `data/`, `private/` ou o servidor.

```powershell
.\test.cmd
npm.cmd run check
node scripts/check-public-repo.js
node scripts/build-pages.js
```

Os testes usam dados fictícios e transporte Meta simulado. A auditoria de publicação bloqueia arquivos privados e padrões conhecidos de segredo, mas não substitui a revisão do diff antes do commit.

## WhatsApp

O padrão é simulação e não envia mensagens reais. A integração compartilhada com o projeto de referência permanece bloqueada até implementar e validar o roteamento aprovado. O adaptador dedicado continua isolado por remetente e contato. Consulte [integração](docs/INTEGRACAO_META.md) e [proposta de roteamento](docs/PROPOSTA_ROTEAMENTO_COMPARTILHADO.md).

Limites: uma instância de servidor; sessões em memória são encerradas em reinício; mídia recebida aparece apenas como indicação; bot automático desligado. As duas contas têm o mesmo acesso à carteira compartilhada. Guardar credenciais e backups privados é responsabilidade operacional do ambiente de hospedagem.
