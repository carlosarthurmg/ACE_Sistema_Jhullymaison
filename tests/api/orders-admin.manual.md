# Testes manuais — pedidos no painel (Enzo) — RF19, RF30

Pré-requisitos: migrations 001 a 007 rodadas, `netlify dev` aberto, login como admin
(cookie de sessão), pelo menos um pedido de **entrega** e um de **retirada** criados pelo checkout.
Execute as ações em `/admin/pedidos` com uma sessão administrativa do plano A. Para testar via cliente HTTP, envie o cookie de desenvolvimento e, nas alterações, o cabeçalho Origin igual à origem de APP_BASE_URL.

## Casos de sucesso
| # | Ação | Esperado |
|---|------|----------|
| S1 | `PATCH /api/admin/orders/:id/status` `{"status":"preparing"}` num pedido `awaiting_payment` | 200; `order_status = preparing`; nova linha em `order_status_history`; linha em `admin_audit_logs` |
| S2 | Pedido de entrega: `preparing` → `shipped`; pedido de retirada: `preparing` → `ready_for_pickup` | 200 em ambos |
| S3 | `PATCH .../payment` `{"payment_status":"paid"}` | 200; `payment_status = paid`; `confirmed_at` preenchido; auditoria registra quem confirmou |
| S4 | Com pagamento `paid`: `shipped` → `delivered` | 200 |
| S5 | `POST .../cancel` num pedido não entregue | 200; `order_status = cancelled`; estoque dos produtos aumenta; `stock_restored_at` preenchido |
| S6 | `GET /api/admin/orders?status=preparing&code=jm1` | 200; só pedidos em preparação; `jm1` encontra `JM-0001` |
| S7 | `GET /api/admin/orders?from=2026-11-19&to=2026-11-19&page_size=5` | 200; no máximo 5 itens, `total` correto |

## Casos de falha
| # | Ação | Esperado |
|---|------|----------|
| F1 | `status = delivered` com `payment_status = pending` | 409 `PAYMENT_REQUIRED`; nada muda |
| F2 | Pular etapa (`awaiting_payment` → `shipped`) | 409 `INVALID_TRANSITION` |
| F3 | Pedido de retirada para `shipped` | 409 `INVALID_TRANSITION` |
| F4 | Cancelar o mesmo pedido duas vezes | 409 `ALREADY_CANCELLED`; estoque **não** aumenta de novo |
| F5 | Cancelar pedido já entregue | 409 `ORDER_FINALIZED` |
| F6 | Chamar qualquer rota sem cookie ou com cookie de cliente | 401 / 403 |
| F7 | `status = "xxx"`, id fora do formato UUID, data `2026-13-45` | 400 `VALIDATION_ERROR` / 404 |

## Fila de e-mail (RF20, RNF07)
| # | Ação | Esperado |
|---|------|----------|
| E1 | `MAIL_MODE=console`: criar um pedido e invocar a função agendada | texto do e-mail aparece no terminal; `notification_outbox.status = sent` |
| E2 | `MAIL_MODE=smtp` sem `GMAIL_APP_PASSWORD` | linha fica `pending`, `last_error_code = MAIL_NOT_CONFIGURED`, `attempt_count = 1` |
| E3 | Após 5 falhas | `status = failed`; não é mais reenviada |
| E4 | Publicado no Netlify: painel Functions mostra `notifications-retry` executando a cada 15 min | execuções registradas |


## Integração com os módulos da equipe

- Aplicar as migrations 001–006 corrigidas no banco de desenvolvimento antes da 007. A 007 registra histórico inicial e aviso em fila na mesma transação do pedido. O checkout não deve repetir esses inserts.
- Para tentar o primeiro e-mail imediatamente, o checkout chama e aguarda `enqueueNewOrderNotification(orderId)` após o commit. Sem a chamada, a Function agendada processa a fila. Configure ADMIN_NOTIFICATION_EMAIL também em desenvolvimento. SMTP pode entregar novamente se o processo cair depois do envio e antes da confirmação no banco.
- Confirmar com Carlos que o login usa o plano A, cookie opaco e token_hash SHA-256 hexadecimal. Se a equipe adotou o plano B, integrar a autorização com o verificador de sessão do projeto antes da publicação.
- Para cancelamento de pedido pago, a implementação conserva o pagamento e exclui o pedido do relatório. Confirmar o tratamento do reembolso com a cliente.
- Verificar em /admin/clientes a pesquisa e o histórico. Em /admin/relatorios, conferir o total por forma de pagamento e as quantidades dos mais vendidos com um pedido pago e um cancelado.
- Em produção, validar o envio real pela Function publicada e a execução a cada 15 minutos. Em desenvolvimento usar MAIL_MODE=console.
