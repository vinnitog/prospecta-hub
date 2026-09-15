# Integração Meta e isolamento

## Reaproveitamento efetivo

Foi inspecionado, em modo de leitura, o adaptador `src/whatsapp-cloud-api.js` e a rota `src/server.js` da Casa dos Coleus. A integração existente combina transporte Meta com catálogo, regras de atendimento, transcrição, frete e estado em memória. Importar esse módulo inteiro criaria acoplamento com o bot e seus dados.

O Prospecta reaproveita o contrato: `/api/whatsapp/webhook`, challenge, assinatura HMAC SHA-256 sobre o corpo original, `/{version}/{phone_number_id}/messages`, bearer token e timeout de 15 segundos. A verificação de assinatura foi adaptada para módulo independente. Não são carregados catálogo, bot, áudio, estado de atendimento nem credenciais do Coleus.

Credenciais reais não estavam em arquivos `.env` na raiz inspecionada; a documentação do Coleus indica configuração no ambiente/provedor. Elas não foram buscadas no provedor, copiadas, exibidas ou alteradas. A configuração operacional atual da Meta não foi auditada nesta etapa.

## Modos desta versão

| Modo | Resultado |
| --- | --- |
| `simulation` (padrão) | CRM local; envios e respostas fictícios. Nenhuma chamada à Meta. Webhook externo fechado. |
| `live` + `shared` | Bloqueado, mesmo com credenciais. Aguarda proposta aprovada e roteador implementado. |
| `live` + `dedicated` | Disponível apenas com configuração completa e remetente diferente do ID protegido do Coleus. Não ativado nesta entrega. |

O ID protegido é uma verificação de configuração, não uma descoberta automática da conta. Não classifique um remetente compartilhado como dedicado para contornar o bloqueio.

Para um futuro ambiente dedicado, preencher em ambiente separado: `PROSPECTA_WHATSAPP_ACCESS_TOKEN`, `PHONE_NUMBER_ID`, `API_VERSION`, `VERIFY_TOKEN`, `APP_SECRET` (todos com prefixo `PROSPECTA_WHATSAPP_`) e `PROSPECTA_COLEUS_PHONE_NUMBER_ID`. Confira versão suportada, escopo do token, número, app, WABA e callback no momento da ativação. Não há versão Graph implícita.

As variáveis `WHATSAPP_*` do Coleus não são lidas pelo Prospecta. Não copiar seu `.env` completo, não compartilhar volume SQLite e não usar seus scripts de deploy.

## Envio e recepção

- Recepção exige assinatura válida, ID exato do remetente e lead cadastrado. Mensagens identificadas pelo `wamid` são deduplicadas em SQLite, inclusive após reinício. O timestamp original delimita a janela, sem renová-la por reentrega.
- Envio real exige opt-in registrado e ausência de bloqueio de contato. Texto livre exige mensagem real recebida nas últimas 24 horas. Fora da janela, usar template aprovado sem variáveis e incluído em `PROSPECTA_WHATSAPP_TEMPLATES`.
- O registro de opt-in é uma evidência informada pelo operador; o sistema não verifica externamente sua autenticidade.
- A chave de cada envio impede repetição do mesmo pedido. Timeout/queda podem significar entrega incerta: o registro fica `unknown`, sem retry automático. Falha definitiva fica `failed`. Resposta com `wamid` fica `accepted`; confirmações posteriores atualizam `sent`, `delivered`, `read` ou `failed`.
- Não há campanha, disparo em massa ou envio automático. Simulações não contam nas métricas reais.
- Mensagens de mídia são sinalizadas sem download. Respostas automáticas permanecem desligadas.

## Fontes consultadas

As notificações de webhook são vinculadas à assinatura/configuração da conta; trocar um callback não cria separação por assunto. A coleção oficial permite override de callback por WABA. O roteamento por contato proposto aqui é uma decisão de arquitetura nossa. [Coleção oficial da Meta: webhook subscriptions](https://www.postman.com/meta/whatsapp-business-platform/folder/ozgs3jn/webhook-subscriptions), [override callback](https://www.postman.com/meta/whatsapp-business-platform/request/un84tul/override-callback-url).

Contrato de mensagens, templates e janela de atendimento: [documentação oficial da Meta no Postman](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api). As páginas diretas do portal Meta retornaram limitação de acesso na consulta; a validação da configuração real e das regras vigentes deve preceder o piloto.
