# PospectSocial Portal

Portal básico de prospecção com login, dashboard inicial e Kanban de leads com drag-and-drop.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- Banco/Auth: Supabase

## Estrutura

- `frontend`: aplicação React (UI/UX, autenticação e Kanban)
- `backend`: API BFF (auth, pipeline, leads, movimentação)
- `backend/supabase/schema.sql`: script SQL com tabelas e políticas RLS

## 1) Configurar Supabase

1. Crie um projeto no Supabase.
2. No SQL Editor, execute o conteúdo de `backend/supabase/schema.sql`.
3. Em Authentication, habilite login por Email/Senha.
4. Crie ao menos um usuário para testar.

### Se estiver usando o schema `*_prospect`

Além do schema principal, execute também:

- `backend/supabase/cadence_tables_prospect.sql`

Esse script cria as tabelas:

- `cadence_prospect`
- `lead_cadence_prospect`

## 2) Variáveis de ambiente

### Backend (`backend/.env`)

Use `backend/.env.example` como base:

```env
PORT=3333
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Frontend (`frontend/.env`)

Use `frontend/.env.example`:

```env
VITE_API_URL=http://localhost:3333/api
```

## 3) Rodar o projeto

Terminal 1:

```bash
cd backend
npm install
npm run dev
```

Terminal 2:

```bash
cd frontend
npm install
npm run dev
```

## 4) Rodar com Docker

### Pré-requisitos

- Docker e Docker Compose instalados.

### Passos

1. Na raiz do projeto, copie o arquivo de exemplo:

```bash
cp .env.docker.example .env
```

2. Preencha no `.env` as variáveis do Supabase:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

3. Suba os containers:

```bash
docker compose up -d --build
```

4. Acesse:

- Frontend: `http://localhost:8080`
- Backend (health): `http://localhost:3333/api/health`

### Dockerfiles disponíveis

- `backend/Dockerfile` (API Node/Express em produção)
- `frontend/Dockerfile` (build React + Nginx para servir SPA)

## 5) Deploy no EasyPanel

Você pode subir em **2 apps separados** (recomendado):

1. **App backend**
   - Build context: `backend`
   - Dockerfile: `backend/Dockerfile`
   - Porta interna: `3333`
   - Variáveis:
     - `NODE_ENV=production`
     - `PORT=3333`
     - `FRONTEND_URL=https://SEU_DOMINIO_FRONTEND`
     - `SUPABASE_URL=...`
     - `SUPABASE_ANON_KEY=...`
     - `SUPABASE_SERVICE_ROLE_KEY=...`

2. **App frontend**
   - Build context: `frontend`
   - Dockerfile: `frontend/Dockerfile`
   - Porta interna: `80`
   - Build Arg:
     - `VITE_API_URL=https://SEU_DOMINIO_BACKEND/api`

Com isso, o frontend já é compilado apontando para a URL pública da API.

## Rotas principais

- Login: `http://localhost:5173/login`
- Dashboard: `http://localhost:5173/dashboard`
- Kanban: `http://localhost:5173/kanban`
- Health API: `http://localhost:3333/api/health`

## Qualidade

- Frontend:
  - `npm run lint`
  - `npm run build`
- Backend:
  - `npm run lint`
  - `npm run build`
