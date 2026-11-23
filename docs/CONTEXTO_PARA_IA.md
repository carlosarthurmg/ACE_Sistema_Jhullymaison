# Contexto do projeto Jhullymaison (para colar na IA)

> Cole este texto no início de cada conversa com a IA e anexe só a parte do guia da sua tarefa.
> Em caso de conflito, valem o **Adendo 1 (v1.1)** e depois o **Guia**. Siga os nomes exatamente. Se faltar um nome ou uma regra, **pergunte antes de inventar**.

## O sistema
E-commerce da loja Jhullymaison (buquês, cestas e presentes personalizados), de uma cliente real. Visitante navega sem login. Cliente se cadastra, favorita, monta carrinho e finaliza pedido (entrega ou retirada; Pix antecipado, ou dinheiro/cartão presencial). Ao confirmar, o sistema gera o código `JM-0001`, baixa o estoque, avisa a administradora por e-mail e abre o WhatsApp (`wa.me`) com o resumo. A administradora gerencia categorias, produtos, estoque, promoções, pedidos, clientes e relatório de vendas. Escopo completo: 42 RF, 20 RNF, 23 RN. Nada é cortado.

## Stack
- **Frontend:** Vue 3 + Vite + TypeScript + Vue Router + Pinia + Tailwind CSS. Interface em português (BR).
- **Backend:** Netlify Functions (Node.js/TypeScript), em `netlify/functions/`. **Sem Express.**
- **Banco:** Supabase (PostgreSQL, Auth, Storage). Scripts SQL versionados em `supabase/migrations/`.
- **E-mail:** Gmail via SMTP com `nodemailer`. Local: `MAIL_MODE=console` (imprime no terminal).
- **Código, banco e tipos em inglês.** Textos da interface em português.

## Regras de arquitetura (não quebrar)
1. O frontend chama somente `/api/*`. Operações autenticadas **não** usam o Supabase JS no navegador.
2. Sessão: cookie `HttpOnly`, `Secure` em produção, `SameSite=Lax`, `Path=/`. Nome vem de `COOKIE_NAME` (`jm_session` em dev, `__Host-jm_session` em produção). **Nunca** guardar token em `localStorage`.
3. A chave `SUPABASE_SERVICE_ROLE_KEY` só existe nas Functions. Nunca no frontend nem em variável `VITE_*`.
4. Preço, total e estoque são calculados **no servidor**, nunca confiados ao navegador.
5. Criar pedido e baixar estoque numa única transação. Pedido nunca é excluído, só cancelado.
6. Dinheiro: `NUMERIC(10,2)` no banco. Chaves primárias em UUID.
7. Resposta de erro sem detalhes internos. Códigos: 200, 201, 204, 400, 401, 403, 404, 409 (estoque/status), 429, 500.

## Regra de preço (um único arquivo: `netlify/functions/_shared/pricing.ts`)
- Promoção vigente = ativa, agora entre `starts_at` e `ends_at`, e `promotional_price < base_price`.
- Preço efetivo sem variações = preço promocional vigente, senão `base_price`.
- Preço efetivo da variação = `variant.price × promotional_price ÷ base_price` (2 casas), senão `variant.price`.
- Adicionais não têm desconto.
- Total do item = `(preço efetivo + soma(adicionais × quantidade)) × quantidade`. Total do pedido = soma dos itens. Sem taxa de entrega.
- Produto com variações ativas: o cliente precisa escolher uma. Variações usam o estoque do produto.
- Preço, nome e variação são copiados para `order_items` no momento da compra.
- Como gravar: `order_items.unit_price_snapshot` = `unitPrice`; `order_items.line_total` = `productLineTotal` (só o produto); `order_item_addons.quantity` = quantidade do adicional **por unidade** do produto; `order_item_addons.line_total` = preço × qtd do adicional × qtd do item; `orders.subtotal` e `orders.total` = `calculateOrderTotals(...)`.
- Importe sempre de `./_shared/pricing` (sem extensão). Contas em centavos; valores de saída em reais com 2 casas.

## Status e valores
- Pedido: `awaiting_payment`, `preparing`, `ready_for_pickup`, `shipped`, `delivered`, `cancelled`.
- Pagamento (separado do pedido): `pending`, `paid`, `cancelled`. Forma: `pix`, `cash_on_delivery`, `card_on_delivery`.
- Entrega: `delivery`, `pickup`. Perfil: `customer`, `admin`.
- **`delivered` exige pagamento `paid`.** Cancelar devolve o estoque uma única vez.
- Toda mudança de status grava uma linha em `order_status_history`, na mesma transação.
- Só entram no relatório de vendas pedidos com pagamento `paid` e não cancelados.

## Tabelas (banco em inglês)
`profiles`, `app_sessions`, `customer_addresses`, `categories`, `products`, `product_categories`, `product_images`, `product_variants`, `product_addons`, `promotions`, `favorites`, `carts`, `cart_items`, `cart_item_addons`, `orders`, `order_items`, `order_item_addons`, `order_status_history`, `admin_audit_logs`, `notification_outbox`, `password_reset_audit`. Usuários ficam em `auth.users` + `profiles`.

## Pastas
```
src/  components/(common|layout|products|cart|orders)  composables/  router/index.ts
      stores/  services/api-client.ts  types/  utils/  views/(public|auth|customer|admin)
netlify/functions/  _shared/(auth|supabase|response|validation|rate-limit|permissions|pricing).ts
      auth-*.ts  products.ts  categories.ts  cart-merge.ts  orders.ts  order-detail.ts
      order-cancel.ts  admin-products.ts  admin-categories.ts  admin-orders.ts
      admin-customers.ts  admin-reports.ts  admin-upload-product-image.ts  notifications-retry.ts
supabase/migrations/  001_create_core_tables.sql ... 006_seed_demo_data.sql
tests/(api|acceptance)
```
Só crie arquivos da sua tarefa. Nunca edite arquivos compartilhados (`api-client.ts`, `domain.types.ts`, `router/index.ts`, `_shared/*`, migrations) sem avisar o grupo.

## Rotas da API (resumo)
- Auth e conta: `POST /api/auth/register|login|logout|reset-request|reset-confirm|change-password`, `GET /api/auth/session`, `GET|PATCH /api/account`, `GET|POST /api/addresses`, `PATCH|DELETE /api/addresses/:id`, `POST /api/account/deletion-request`.
- Catálogo: `GET /api/categories`, `GET /api/products`, `GET /api/products/:slug`.
- Admin catálogo: `POST|PATCH|DELETE /api/admin/categories[/:id]`, `POST|PATCH|DELETE /api/admin/products[/:id]`, `POST /api/admin/products/:id/variants|addons|promotions|image`.
- Carrinho e pedidos: `POST /api/cart/merge`, `GET /api/cart`, `PUT /api/cart/items`, `DELETE /api/cart/items/:id`, `POST|GET /api/orders`, `GET /api/orders/:id`, `POST /api/orders/:id/cancel-request`.
- Admin pedidos: `GET /api/admin/orders`, `PATCH /api/admin/orders/:id/status|payment`, `POST /api/admin/orders/:id/cancel`, `GET /api/admin/customers[/:id/orders]`, `GET /api/admin/reports/sales`.

## Quem faz o quê
- **Carlos:** autenticação, conta, segurança, integração, revisão e deploy.
- **Rodolfo:** produtos, categorias, variações, adicionais, estoque, promoções, fotos, catálogo.
- **João:** favoritos, carrinho, endereços, checkout.
- **Enzo:** pedidos, pagamentos, status, painel admin, relatório, notificações.

## Variáveis de ambiente (nomes; valores só no `.env` local ou no painel do Netlify)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SESSION_ENCRYPTION_KEY`, `ADMIN_NOTIFICATION_EMAIL`, `APP_BASE_URL`, `COOKIE_NAME`, `COOKIE_MAX_AGE_SECONDS`, `RATE_LIMIT_SECRET`, `INTERNAL_JOB_SECRET`, `MAIL_MODE`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_FROM_NAME`.
(`RESEND_API_KEY` **não existe mais**.)

## Segurança e Git
- `.env` nunca vai para o Git. Só o `.env.example`, sem valores. Repositório público.
- Nunca escreva chave, senha ou token no código, em testes, em exemplos ou nas respostas.
- Validar toda entrada no servidor; consultas parametrizadas; não logar cookie, token nem senha.
- Branch: `feature/RF-XX-descricao`. Commit: `feat(auth): implement login cookie` (tipos `feat`, `fix`, `docs`, `test`, `chore`).
- Cada pessoa commita o próprio código, com a própria conta. Nada de ZIP. Pull Request revisado por outra pessoa; merge com *Create a merge commit*.
- Antes de cada commit: `git status` e conferir que nenhum `.env` está na lista.

## Como responder
Entregue código completo dos arquivos da tarefa, nos caminhos acima, com TypeScript tipado e tratamento de erro. Diga como testar. Se algo conflitar com este texto, avise em vez de decidir sozinho.
