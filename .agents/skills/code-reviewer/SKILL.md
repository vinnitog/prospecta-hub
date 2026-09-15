---
name: code-reviewer
description: Revisar mudanças no Prospecta Hub buscando regressões de CRM, persistência, autenticação e separação de projetos na integração WhatsApp.
---

# Revisão do Prospecta Hub

Inspecione o diff e seus consumidores. Priorize defeitos reproduzíveis e impacto para o operador: perda de lead/mensagem, resposta no projeto errado, duplicação de envio, métrica falsa e exposição de credenciais ou conteúdo.

Para integrações, confira o isolamento em `docs/INTEGRACAO_META.md`, especialmente IDs de remetente, número compartilhado bloqueado, status fora de ordem e falhas ambíguas. Para persistência, teste importação parcial, unicidade e reinício. Para UI/API, revise escaping, autenticação, origem/CSRF e feedback de falha.

Corrija defeitos dentro do escopo e valide com teste de comportamento pertinente. Não ampliar a revisão para alterar Casa dos Coleus ou ativar a conta Meta. No resumo, distinguir achados corrigidos, pendências e limites de evidência.
