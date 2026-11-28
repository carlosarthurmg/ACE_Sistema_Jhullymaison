# Aceite do login — como rodar e o que mostrar

Os testes automáticos usam um Supabase **simulado**. Isto aqui é o teste real, no seu computador, contra o **seu** projeto Supabase de desenvolvimento. Só conta como aprovado o que você executou e viu.

## Antes
1. Migrations 001 a 006 rodadas no seu Supabase (o `verify.sql` deu 21 tabelas).
2. No `.env` (nunca no Git): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `COOKIE_NAME=jm_session`, `COOKIE_MAX_AGE_SECONDS=7200`, `MAIL_MODE=console` e `SESSION_ENCRYPTION_KEY`. Para gerar a chave:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
3. `npm install` e `npm run dev:netlify`. Abra `http://localhost:8888` no navegador.
4. Abra as ferramentas do navegador (F12) > aba **Console**. Cole um bloco por vez.

## Roteiro (cole no Console)
**Cadastro (já faz o login):**
```js
await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({full_name:'Cliente Teste',phone:'86999990000',email:'teste1@exemplo.com',password:'Senha123',accepted_terms:true})}).then(async r=>[r.status, await r.json()])
```
Esperado: `201` e `{ data: { user: { id, full_name, role: "customer" } } }`.

**Critério 1 — atributos do cookie.** F12 > **Application** (ou Armazenamento) > Cookies > `http://localhost:8888`. O `jm_session` deve ter: **HttpOnly marcado**, **SameSite = Lax**, **Path = /**. (Em desenvolvimento não tem `Secure`; em produção tem.)

**Critério 2 — o JavaScript não vê o cookie:**
```js
document.cookie
```
Esperado: **não aparece** `jm_session`.

**Critério 3 — sessão:**
```js
await fetch('/api/auth/session').then(async r=>[r.status, await r.json()])
```
Esperado: `200` com o usuário. Em uma **janela anônima** (sem cookie), o mesmo comando dá `401`.

**Critério 4 — logout:**
```js
await fetch('/api/auth/logout',{method:'POST'}).then(r=>r.status)
await fetch('/api/auth/session').then(r=>r.status)
```
Esperado: `204` e depois `401`. O cookie some da aba Application.

**Login e bloqueio:**
```js
await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'teste1@exemplo.com',password:'Senha123'})}).then(async r=>[r.status, await r.json()])
```
Esperado: `200`. Com senha errada: `401` e a mensagem "E-mail ou senha incorretos." Depois de **5 erros seguidos**: `429`.

**No Supabase (Table Editor):** `profiles` tem a linha com `accepted_terms_version = 2026-11-v1`; `app_sessions` tem linhas com `token_hash` (texto hexadecimal longo, **não** o valor do cookie) e `revoked_at` preenchido nas sessões encerradas.

## O que eu NÃO consegui verificar (olhe com atenção)
- Se o **Supabase devolve `status 400` / `invalid_credentials`** quando a senha está errada. Se o login com senha errada der `500` em vez de `401`, me mande a linha `[api] ...` do terminal.
- Se um e-mail repetido no cadastro vira `409`. Se der `500`, mande a linha do terminal.
- Se o **`Set-Cookie` chega ao navegador** no Netlify. Os testes confirmam o cabeçalho no Node, mas o ambiente do Netlify é que decide. Se o cookie não aparecer na aba Application, me avise: o plano é trocar para `context.cookies.set` do Netlify.
- Os critérios **5** (trocar senha derruba o cookie antigo) e **6** (site publicado, dois navegadores, `Secure`) dependem da recuperação de senha e do deploy.

## Anote o resultado
| Critério | Passou? | Observação |
|----------|---------|------------|
| 1 Cookie HttpOnly, SameSite=Lax, Path=/ | | |
| 2 `document.cookie` não mostra a sessão | | |
| 3 Sessão: 200 com cookie, 401 sem | | |
| 4 Logout apaga o cookie e invalida a sessão | | |
| Login errado: 401 igual; 5 erros: 429 | | |
