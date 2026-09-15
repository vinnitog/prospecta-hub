---
name: qa-senior
description: Definir validação baseada em risco para mudanças de leads, inbox, pipeline, SQLite e integração Meta do Prospecta Hub.
---

# QA do Prospecta Hub

Mapeie a alteração até a ação visível ao operador e a possível consequência externa. Leia os testes existentes antes de pedir novos.

Para leads/pipeline: considerar validação, duplicatas, atomicidade, atualização e persistência. Para inbox: considerar recebido/enviado/simulado, não lidas, falhas e preservação de rascunho. Para Meta: considerar assinatura inválida, contato/remetente errado, evento repetido, janela de 24h, opt-out, timeout e reinício durante envio.

Use somente dados fictícios e transporte simulado. Testes no serviço do Coleus, envio real ou alteração de callback não são extensões automáticas desta análise. Registrar o que requer piloto aprovado e os casos verificáveis localmente.
