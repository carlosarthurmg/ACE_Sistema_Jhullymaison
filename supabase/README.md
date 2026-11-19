# Banco de dados (Supabase)

Scripts SQL do projeto. **Toda mudança no banco vira um arquivo aqui.** Ninguém altera o banco "na mão" (pelo painel) sem registrar o script.

## Como criar o SEU banco de desenvolvimento
1. Crie sua conta e um projeto no Supabase (gratuito). Anote a senha do banco.
2. Abra **SQL Editor** > **New query**.
3. Cole e execute, **nesta ordem**, o conteúdo de:
   `migrations/001_create_core_tables.sql`, `002_...`, `003_...`, `004_...`, `005_...` e `006_seed_demo_data.sql`.
4. Cole e execute `verify.sql`. O resultado esperado está em cada comentário: **21 tabelas**, **nenhuma tabela sem RLS**, **3 categorias, 6 produtos e 4 visíveis no catálogo**.
5. Se algo der erro, **não conserte com comandos soltos**: apague o projeto, crie outro e rode tudo de novo.

## Regras
- Para mudar o banco depois: crie um arquivo novo, `007_descricao.sql`, e abra um Pull Request. **Nunca edite um arquivo já executado por alguém.**
- Toda tabela nova do schema `public` tem RLS ligado (Guia, seção 8). Sem policy = o navegador não acessa; só as Functions.
- Dados fictícios ficam em `006`. Antes de publicar a loja de verdade, remover os produtos de demonstração.
- A conta da administradora **não** é criada por SQL: será criada por script, com a senha vinda do `.env`.

## O que difere do SQL de referência do Guia (Apêndice E)
| Mudança | Motivo |
|---------|--------|
| `products` sem `category_id` e sem `image_path` | Adendo 1: várias categorias e várias fotos |
| Novas: `product_categories`, `product_images`, `order_status_history` | Adendo 1 (seções 4.2 e 4.3) |
| `product_variants.price` no lugar de `price_delta` | RF33: preço próprio |
| `profiles.anonymized_at` | RF42 / RN20 |
| Código do pedido `JM-0001` | Decisão D4 |
| RLS ligado em **todas** as tabelas, não só em algumas | Tabela sem RLS fica aberta ao navegador |
| `orders`: não pode ficar `delivered` sem `payment_status = 'paid'` | RN05 garantida também pelo banco |
| `order_items.product_id` com `RESTRICT` | RN17: produto com pedido não é excluído (a Function responde 409 e sugere inativar) |
| `cart_items.product_id` e `cart_item_addons.addon_id` com `CASCADE` | Excluir produto não pode travar por causa de carrinho |
| `next_order_code()` só executável pela service role | O navegador não gera códigos |
| Um endereço padrão por cliente; uma capa por produto | Integridade |
