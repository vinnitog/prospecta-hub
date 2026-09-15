---
name: prospecta-meta-isolation
description: Alterar integração Meta, webhook ou roteamento do Prospecta Hub preservando o isolamento em relação ao Casa dos Coleus.
---

# Isolamento Meta do Prospecta

Leia `docs/INTEGRACAO_META.md` para o contrato e `docs/PROPOSTA_ROTEAMENTO_COMPARTILHADO.md` para ativação ou roteamento. Esses caminhos são relativos à raiz do Prospecta Hub.

O mesmo número atende outro projeto em negociação. Não confundir credenciais válidas com roteamento seguro. O modo compartilhado deve permanecer bloqueado até o roteador aprovado estar implementado e validado.

Preserve as invariantes: identificação por remetente e contato, decisão exclusiva por evento, HMAC nos bytes originais, deduplicação durável, fila sem fallback cruzado e ausência de retry automático de saída incerta. Normalização não deve inventar nono dígito/DDI. Qualquer mudança de proprietário precisa considerar respostas já agendadas no Coleus.

Não importar runtime ou banco do Coleus, não copiar seu ambiente inteiro, não alterar callback ou assinatura de WABA como efeito colateral. Preparar código, testes e configuração concreta antes de submeter uma mudança externa à revisão requerida pelo usuário.

Nos testes, usar fetch injetado e números fictícios. Relatar separadamente adaptação de código, testes com Meta simulada e validação real da conta.
