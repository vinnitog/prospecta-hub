# Validação

## Segurança e publicação — 15/09/2026

25 testes automatizados passaram, com dados fictícios, transporte Meta substituído e SQLite temporário. Cobertura inclui integração isolada, assinatura, duplicatas, janela de atendimento, importação atômica, status fora de ordem, duas contas, logout, senha inicial obrigatória, revogação de sessões, CSRF, limitação de tentativas e edição concorrente.

O banco e a lista original de leads foram mantidos somente no armazenamento privado local. Nenhum dado real é necessário para executar testes no CI. A lista de arquivos públicos é auditada antes do commit, e o workflow Pages publica apenas dois arquivos do portal estático.

Tipografia ampliada para 16px no corpo, mensagens e campos; auxiliares de 13–14px, maior contraste e controles com altura mínima de 42px. Login inspecionado visualmente no navegador integrado e fontes efetivas verificadas.

O sistema exige login mesmo em loopback. Os hashes de senha e o histórico de auditoria ficam no SQLite privado. Senhas iniciais são geradas localmente e a troca no primeiro login é obrigatória.

## Limites

Nenhum envio real ou alteração da configuração Meta foi realizado. Nenhum arquivo, processo, deploy ou configuração do projeto de referência foi alterado. A integração dedicada foi exercitada somente com transporte simulado; o roteador compartilhado continua como proposta.

GitHub Pages hospeda apenas o portal público. Para acessar a carteira pela internet, o backend deve ser hospedado separadamente e seu endereço HTTPS configurado no portal. Sessões em memória exigem uma instância e são encerradas em reinício. Exportar JSON não equivale a um backup completo de contas e banco.
