# Skills do projeto

Workflow adaptado das etapas de implementação, revisão e QA do `dev-workflow-kit`. As skills abaixo foram escritas para este domínio com `skill-creator`; não foi necessário copiar o pacote completo, scripts de terceiros, políticas de publicação automática ou skills de precificação/design/LGPD sem aplicação nesta tarefa.

| Skill | Quando usar |
| --- | --- |
| `senior-dev` (instalada no ambiente do usuário) | Implementar mudanças pequenas e claras. |
| [prospecta-meta-isolation](.agents/skills/prospecta-meta-isolation/SKILL.md) | Alterar transporte Meta, regras de propriedade, webhook ou ativação. |
| [code-reviewer](.agents/skills/code-reviewer/SKILL.md) | Revisar mudanças deste CRM antes de concluir. |
| [qa-senior](.agents/skills/qa-senior/SKILL.md) | Definir cenários de risco e validação. |
| [qa-automate](.agents/skills/qa-automate/SKILL.md) | Implementar testes de comportamento do CRM e integração. |

As quatro skills locais ficam em `.agents/skills/`, disponíveis ao Codex e agentes compatíveis. Os papéis não exigem processos de subagentes: podem ser aplicados sequencialmente na sessão, respeitando a autorização vigente.
