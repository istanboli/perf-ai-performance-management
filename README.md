# PERF

**AI KPI & OKR Architect — performance management for designing, auditing, aligning, and improving KPIs and OKRs.**

Designed & Created by Yassin Astanboli.

This repository is a production source backup of the current PERF app. It is not a vanity-metric generator: it refuses to invent benchmarks, and it will say “this is not a good KPI.”

## Tech stack

- Frontend: React 19, TanStack Start / Router / Query, Tailwind CSS v4
- Backend: TanStack Start server functions
- Database: Postgres (`DATABASE_URL` / Neon in production, PGLite WASM in local preview)
- Auth: Better Auth (email/password + Grok OAuth broker: Google, X)
- AI: xAI Grok via `XAI_API_KEY` behind `src/lib/ai/service.ts`, with a local deterministic fallback

## Install

```bash
npm install
```

Node 22 is required.

## Development

```bash
cp .env.example .env   # fill in values; never commit `.env`
npm run dev
```

The app listens on `0.0.0.0:8080`.

Inside Grok App Builder, do **not** create a `.env` file — the platform injects secrets.

## Tests

```bash
npm test
npm run typecheck
```

Product tests live in `src/lib/p0-repair.test.ts` and `src/lib/v6.test.ts`. Template auth/app-data tests live under `src/lib/auth/` and `src/lib/app-data/`.

## Production build

```bash
npm run build
```

This runs Vite/Nitro (Vercel preset) and then `npm run db:migrate`.

## Migrations

SQL lives in `migrations/`:

- `0001_auth.sql` — Better Auth tables (copied from `migrations/auth/`)
- `0002_schema.sql` — product schema (workspaces, projects, objectives, key results, KPIs, check-ins, versions, audit logs, AI interactions)

```bash
npm run db:migrate
```

If `DATABASE_URL` is unset, migrate skips and PGLite applies the same files itself on first use.

## Environment variables

See `.env.example`. Required for a real production deploy:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Session signing secret |
| `BETTER_AUTH_URL` | Public origin of the app |
| `VITE_AUTH_ENABLED` | Set to `true` for real auth |
| `XAI_API_KEY` | xAI Grok (optional; local architect fallback if absent) |
| `GROK_AUTH_ISSUER` | Grok auth broker (optional; has a default) |
| `GROK_AUTH_CLIENT_ID` / `GROK_AUTH_CLIENT_SECRET` | Per-app OAuth client (preview fallback exists) |
| `VITE_PUBLIC_HOSTNAME` | Published `*.grok.me` host (injected on Grok publish) |

Never commit secrets. Only `VITE_*` variables reach the browser.

## Deployment

- **Grok Build:** set `.grok/app-env.json` → `"deploy": { "database": true }`, then Publish. The platform provisions Neon, injects env vars, and deploys to Vercel as `*.grok.me`.
- **Independent:** deploy the Nitro Vercel output (or any Node host), attach Postgres, set the env vars above, run migrations. Swap the AI adapter in `src/lib/ai/service.ts` to change providers.

The app does not require the Grok sandbox at runtime.

## Project structure

```
src/routes/           pages (landing, login, app, projects, KPIs, OKRs, …)
src/lib/server/fns.ts server functions (CRUD, AI, quality gate, dashboard)
src/lib/kpi-engine.ts quality gate, scoring, alignment, gaming detection
src/lib/system-builder.ts  AI → draft mapper
src/lib/ai/           Grok client + Zod schemas
src/lib/auth/         Better Auth (do not rewrite server.ts)
src/lib/db.ts         Neon when DATABASE_URL is set, else PGLite
migrations/           Postgres schema
scripts/              env wrapper, migrate, smoke tests
.grok/app-env.json    Grok deploy flags (database: true)
```

## Export

CSV, JSON, and printable PDF (browser print) are implemented. Native Word / Excel binaries are not in this MVP.
