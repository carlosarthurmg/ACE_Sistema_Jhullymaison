# Módulo Catálogo e administração de produtos (Rodolfo), v2

Requisitos: RF03–RF11, RF22, RF23, RF33, RF34, RF41 | RN01, RN02, RN03, RN07, RN10, RN16, RN17.
Branch: `feature/RF-03-catalog`. Versão alinhada ao **Adendo 1 v1.1** e ao retorno do Carlos.

## O que mudou nesta versão

### Retorno do Carlos, ponto a ponto
| Ponto | O que foi feito |
|---|---|
| `auth.ts` placeholder | Removido do módulo (e também `permissions.ts`). As Functions admin chamam `requireAdmin(req)` de `_shared/permissions` (oficial do Carlos). Contrato: retorna `{ id }` do admin e lança `HttpError` 401/403. |
| Sem `package.json`, Vite/TS e migration 001 | Não são do módulo. Veja "O que o módulo exige do projeto-base" abaixo. |
| `api-client.ts` duplicado | Removido. Todas as chamadas HTTP passam por `src/services/catalog.service.ts`, que importa o `api-client` central. Se a API do central for diferente, só esse arquivo muda. |
| Favoritos | `ProductCard` mostra o coração na Home e no Catálogo, ligado à store por `src/composables/useCatalogFavorites.ts`. Visitante que tenta favoritar vai para `/login?redirect=…` (RN09). |
| Falhas banco x Storage | Ver "Consistência" abaixo. |
| Mensagem de ativar/inativar invertida | Corrigido em `AdminProductFormView.vue`: a mensagem agora é decidida **antes** da mudança (`willActivate`). |

### Adendo 1
| Adendo | Aplicado |
|---|---|
| 4.1 / 4.2: `products` sem `category_id` e `image_path` | Migration 002 reescrita. |
| 4.2: `product_categories` (várias categorias, mínimo 1, RN10) | Tabela + validação na Function + função SQL atômica. |
| 4.2: `product_images` (várias fotos, capa, ordem, `alt_text`) | Tabela + endpoints `/images` + galeria no painel e na página do produto. |
| 4.2: `product_variants.price` (preço próprio, RF33) | Migration, validação, painel e telas. |
| 4.4: sem policy para `anon`/`authenticated`; leitura só pelas Functions | RLS ligado sem policies. `products.ts` e `categories.ts` agora usam a service role e aplicam os filtros de visibilidade no código. |
| 4.5: regra única de preço | `_shared/pricing.ts` (ver abaixo). |
| 11: acessibilidade (RNF20) | Ver checklist no fim. |

## Integração com o projeto-base (como está o repositório hoje)
Verificação no repositório real (branch `feature/RF-03-catalog`, já com o `pricing.ts` do Carlos vindo da `develop`), em 21/11/2026: `npm run typecheck` passa sem erros, `npm test` passa com **41 testes** (27 do pricing do Carlos, 13 do catálogo e 1 do projeto-base) e `npm run build` (vue-tsc + vite build) passa.

**Arquivos novos (só meus, sem colisão):** tudo em `src/` (componentes, views, `catalog.service.ts`, `catalog.types.ts`, `catalog.routes.ts`, `catalog.css`…), `netlify/functions/*` do catálogo, `_shared/{catalog,catalog-errors,catalog-validation,supabase,audit}.ts`, `tests/` e `supabase/migrations/007_catalog_atomic_operations.sql`.

**Arquivos compartilhados que o módulo mexe (avisar o grupo no PR):**
| Arquivo | Mudança |
|---|---|
| `src/views/public/HomeView.vue` | Substitui a tela provisória do projeto-base pela Home real (RF41). |
| `src/router/index.ts` | `...catalogRoutes` no lugar da rota `/` provisória. |
| `src/assets/styles/main.css` | Uma linha: `@import "./catalog.css";` (as cores usam os tokens `brand-*` do próprio main.css). |
| `package.json` / `package-lock.json` | `zod` e `@supabase/supabase-js`. |

**O que o módulo NÃO altera:** `response.ts` (uso `ok`, `noContent` e `fail`; `HttpError`, `handle` e `assertDb` ficam em `_shared/catalog-errors.ts`) e `api-client.ts` (só o upload de foto usa `fetch` direto, porque o `api-client` sempre envia JSON).

**Ainda não existem no projeto (erros esperados até chegarem):**
| Falta | De quem | O que acontece |
|---|---|---|
| `netlify/functions/_shared/permissions.ts` (`requireAdmin(req)` devolvendo `{ id }` e lançando 401/403) | Carlos | As 3 Functions admin não compilam sem ele. |
| `src/stores/cart.store.ts` (`addItem({ product_id, variant_id, addon_ids, quantity, personalization_note })`) | João | `ProductDetailView` não compila sem ele. |
| `src/stores/favorites.store.ts` (`isFavorite(id)`, `toggle(id)`, `load()`) | quem fizer favoritos | `useCatalogFavorites` não compila sem ele. |
| Pasta `supabase/` (PR #2) | Carlos | A `007` depende das migrations 001 a 006. |

Para trabalhar enquanto isso, use os arquivos de `_stubs-nao-commitar/` (do zip, nunca do repositório) e esconda-os do Git com `.git/info/exclude`.

## Preço (Adendo 4.5)
`netlify/functions/_shared/pricing.ts` implementa a regra: produto = promoção vigente ou `base_price`; variação = `price × promocional ÷ base_price` (2 casas); adicionais sem desconto; total do item = `(efetivo + Σ adicional × qtd) × quantidade`; total do pedido = soma dos itens.
O arquivo é do Carlos (PR #3, já na `develop`) e o catálogo não calcula preço: `_shared/catalog.ts` só converte as promoções do banco para o formato dele e chama `getEffectivePrice`. Testes em `tests/unit/pricing.test.ts` (do Carlos).

## Consistência entre banco e Storage
O banco é a fonte da verdade.
- **Envio de foto:** sobe o arquivo; se gravar em `product_images` falhar, o arquivo é apagado (nada de órfão). Limite de 8 fotos por produto.
- **Excluir foto:** apaga a linha primeiro; se apagar o arquivo falhar, só registra em log (sobra lixo, nunca uma foto quebrada no site). Se era a capa, a próxima vira capa.
- **Excluir produto:** função SQL `catalog_delete_product` faz tudo em **uma transação** (confere pedidos, limpa carrinhos, exclui) e devolve os caminhos das fotos para limpar o Storage.
- **Criar produto:** se vincular as categorias falhar, o produto é desfeito (nunca fica produto sem categoria).
- **Trocar categorias, trocar capa e realocar categoria:** funções SQL atômicas (`catalog_set_product_categories`, `catalog_set_cover`, `catalog_reassign_category`). Só a service role pode executá-las.

## Contrato para o João (mudou)
`GET /api/products/:slug` → `ProductDetail` (`src/types/catalog.types.ts`):
`id, slug, name, categories[], base_price, effective_price, on_promotion, discount_percent, stock_available, image_url, image_alt, images[{id,url,alt_text,is_cover}], variants[{id,name,price,original_price}], addons[{id,name,price}]`.
- `variants[].price` já vem com a promoção proporcional; `original_price` é o valor cadastrado.
- Com variações ativas, o cliente precisa escolher uma (item 7). O checkout **recalcula** com `pricing.ts`; nunca confia no navegador.
- O carrinho recebe de `ProductDetailView`: `cart.addItem({ product_id, variant_id, addon_ids, quantity, personalization_note })`. Adicional entra com quantidade 1 (a UI ainda não tem quantidade por adicional).

## Rotas de API
Públicas: `GET /api/categories`, `GET /api/products`, `GET /api/products/:slug`.
Admin: `/api/admin/categories[/:id]`, `/api/admin/products[/:id]`, `/api/admin/products/:id/{variants|addons|promotions}[/:childId]`, `/api/admin/products/:id/image[/:imageId]`.
O upload mantém a rota do Guia (`POST /api/admin/products/:id/image`); cada chamada adiciona uma foto (Adendo 4.2). Além do Guia: `GET` de detalhe/lista admin, `PATCH/DELETE` dos filhos e `PATCH/DELETE /image/:imageId` (capa, descrição, remover).

## Testes
Automatizados: `npx vitest run` (41 testes no total: 27 do `pricing.ts` do Carlos em `tests/unit/pricing.test.ts`, 9 de validação e 4 de mapeamento de erros do catálogo em `tests/api/`, e 1 do projeto-base em `tests/api/health.test.ts`) e `node tests/sql/catalog-sql.test.mjs` (verificações das migrations 002 e 007 num PostgreSQL real, via `@electric-sql/pglite`; precisa da 002 do Carlos no repositório e de `npm i -D @electric-sql/pglite`).
Manuais:
| # | Cenário | Esperado |
|---|---|---|
| 1 | Visitante abre `/catalogo` | Só produtos aprovados, ativos e com estoque > 0 |
| 2 | Admin zera o estoque | Some do catálogo; `/api/products/:slug` dá 404 |
| 3 | Produto criado sem aprovar | "Aguardando aprovação", fora da vitrine |
| 4 | Promoção 200 → 180 | Selo, preço riscado; variação de 240 vira 216 |
| 5 | Promoção com preço ≥ original | 400 |
| 6 | Promoção vencida | Preço normal sem ação manual |
| 7 | Produto com 2 variações | Precisa escolher uma; total = efetivo + adicionais |
| 8 | Criar produto sem categoria | Bloqueado na tela e na API (400) |
| 9 | Produto em 2 categorias | Aparece nos dois filtros do catálogo |
| 10 | Excluir categoria com produtos | 409 até escolher destino; depois os produtos migram |
| 11 | Excluir produto com pedidos | Só inativa |
| 12 | Excluir produto sem pedidos | Removido; fotos apagadas do bucket |
| 13 | Enviar 2 fotos, trocar a capa, remover a capa | Primeira é capa; troca funciona; a próxima assume |
| 14 | Upload `.php` renomeado `.jpg` / arquivo > 2 MB / 9ª foto | 400 nos três |
| 15 | Cliente comum em `/api/admin/*` / sem sessão / sem Origin | 403 / 401 / 403 |
| 16 | Inativar e reativar o produto | Mensagem certa em cada caso |
| 17 | Visitante clica no coração | Vai para `/login` e volta |

## Checklist de acessibilidade (Adendo, seção 11)
- Contraste ≥ 4,5:1 (medido: dourado 5,6:1, cinza 5,7:1 sobre o fundo claro); dourado escurecido para `#7a5c22`.
- Fotos com `alt` vindo de `product_images.alt_text` (fallback: nome do produto); miniaturas decorativas com `alt=""`.
- Todo campo com `<label>`; erros em texto com `role="alert"`; ícones com `aria-label`; foco visível em botões, campos e chips.
- Telas públicas com texto ≥ 16 px; botões, chips e campos com altura ≥ 44 px (coração 44 × 44).
- Pendente: conferir com zoom 200% e navegação só por teclado no navegador antes do PR.

## Antes de cada commit
```
git status
git diff --cached --name-only
git diff --cached | grep -inE "secret|password|api_key|service_role|app_password|eyJ"
```
Nenhum `.env` e nenhum arquivo de `_stubs-nao-commitar/` pode ir no commit.

## Conferência contra o Guia e o Adendo (feita em código, não de memória)
| Item | Fonte | Resultado |
|---|---|---|
| Colunas de `categories`, `products`, `product_addons`, `promotions` | Guia, Apêndice E | Idênticas (products sem `category_id`/`image_path`, Adendo 4.1) |
| `product_variants.price`, `product_categories`, `product_images` e índices | Adendo 4.2 | Idênticos, inclusive os nomes dos índices e a capa única |
| Sem policy para `anon`/`authenticated` | Adendo 4.4 | Confirmado no banco: 0 policies, RLS ligado nas 7 tabelas |
| Regra de preço, itens 1 a 7 | Adendo 4.5 | `pricing.ts` (Carlos) + 27 testes em `tests/unit/pricing.test.ts` |
| Nomes das rotas e das telas (`/catalogo`, `/produto/:slug`, `/admin/produtos`…) | Guia 7.1 e 7.3 | Idênticos |
| Endpoints públicos e admin | Guia 6.3 | Idênticos (upload em `/image`) |
| Formato `{ data, error }` e códigos HTTP | Guia 6.1 | Igual |
| `admin_audit_logs`, `cart_items`, `order_items` | Guia, Apêndice E | Colunas usadas existem |
| RN01, RN02, RN03, RN07, RN10, RN16, RN17 | Guia, seção de RNs | Implementadas e cobertas pelos testes manuais |
| Nomes em inglês no código e no banco | Adendo D3 | Sim; português só na interface |

### Bug achado e corrigido nesta conferência
`ON DELETE RESTRICT` devolve o código `23001` (não `23503`), e o tratamento de erro só reconhecia o segundo: uma exclusão bloqueada por vínculo viraria erro 500. Agora vira 409 (teste em `tests/api/catalog-errors.test.ts`).

### Diferenças conhecidas em relação ao Guia (para o Carlos decidir)
1. **Seed da 006** quebra com o novo esquema (ver acima).
2. **`/admin/produtos/novo`:** o Guia lista variações, adicionais, imagem e promoção na mesma tela de criação. Como essas partes precisam do `id` do produto, a tela cria o produto primeiro e, em seguida, libera esses blocos (já na rota de edição).
3. **Adicional com quantidade:** a regra 4.5 prevê quantidade por adicional; a UI usa 1 por adicional até o carrinho do João definir `cart_item_addons.quantity`.
4. **Arquivos com nomes do projeto:** `utils/catalog-format.ts` repete `formatBRL`/datas; troque pelos utilitários centrais (`money`, `dates`) quando existirem. `types/catalog.types.ts` pode ser mesclado ao `domain.types.ts` pelo Carlos.

### O que NÃO foi testado
Nada rodou contra um Supabase real nem no navegador: as consultas do `supabase-js` (embeds de `product_categories`, filtros por categoria), o envio ao Storage e as telas dependem do projeto-base e de um banco. Fica para o teste de integração depois do merge do Carlos.
