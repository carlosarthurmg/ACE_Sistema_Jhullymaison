# ACE_Sistema_Jhullymaison

Sistema de e-commerce da loja **Jhullymaison** (buquês, cestas e presentes personalizados).
Projeto ACE — Desenvolvimento e Implementação de Sistemas, UNIFSA, 6º período.

**Stack:** Vue 3 + Vite + TypeScript + Vue Router + Pinia + Tailwind CSS 4 · Netlify Functions (Node.js) · Supabase (PostgreSQL, Auth, Storage).

## Documentos
- `docs/` — requisitos, Guia de Implementação, Adendo 1 e `CONTEXTO_PARA_IA.md`.
- Em caso de conflito vale o **Adendo 1**, depois o **Guia**.

## Como rodar no seu computador (Windows ou Mac)
1. Instale o **Node.js 24** (`node -v` deve mostrar v24.x) e o **Git**.
2. Instale a CLI do Netlify (uma vez): `npm install -g netlify-cli`
3. Clone o repositório e entre na pasta.
4. `npm install`
5. Copie `.env.example` para `.env` e preencha com os dados do **seu** projeto Supabase de desenvolvimento. **Nunca commite o `.env`.**
6. `npm run dev:netlify` e abra `http://localhost:8888`. Se o Netlify perguntar para conectar a um site, escolha não conectar.
   - Só o frontend, sem a API: `npm run dev` (`http://localhost:5173`).
7. A tela inicial deve mostrar **"API respondendo (/api/health)"**.

## Comandos
| Comando | O que faz |
|---------|-----------|
| `npm run dev:netlify` | Site + Functions juntos (use este) |
| `npm run dev` | Só o frontend |
| `npm run build` | Confere tipos e gera a versão de produção |
| `npm test` | Roda os testes |

## Regras do time
- Nada de trabalho direto na `main` nem na `develop`: branch `feature/RF-XX-descricao` + Pull Request revisado por outra pessoa.
- Cada pessoa commita o próprio código, com a própria conta. ZIP não conta.
- Merge de PR com **Create a merge commit** (não *Squash*).
- Antes de cada commit: `git status` e confirmar que **nenhum `.env`** está na lista.
- Banco: toda mudança vira um arquivo `.sql` em `supabase/migrations/`. Nunca altere o banco "na mão".
- Arquivos compartilhados (`src/services/api-client.ts`, `src/router/index.ts`, `src/types/*`, `netlify/functions/_shared/*`, migrations): avise o grupo antes de editar.

## Equivalência DER (português) ↔ banco (inglês)
Copiar aqui a seção 5 do Adendo 1.
