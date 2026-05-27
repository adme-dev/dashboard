# XeroFlow Agency

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI%20v4-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

Internal operations dashboard for a digital marketing agency. Manages work (boards, Kanban, timeline, calendar), clients, projects, financials (Xero integration, EOM invoicing, ad spend tracking), real-time chat, AI-powered insights, and a client portal.

## Project Links

- Source repository: https://github.com/adme-dev/dashboard

## Feature Highlights

- **Work Management** — Monday.com-style boards with 20+ column types, Kanban, timeline, calendar, and gallery views. Groups, subtasks, real-time collaboration via Durable Objects.
- **Client & Project Management** — Client records, briefs, proofs, intake forms, approval workflows, and a dedicated client portal with permission-gated access.
- **Financial Operations** — Xero OAuth integration (invoices, expenses, P&L), cashflow forecasting, end-of-month invoice generation engine with Xero upload.
- **Ad Spend Tracking** — Meta Ads and Google Ads integrations with OAuth connections, daily/campaign spend syncing, and budget management.
- **Real-Time Chat** — Channels, DMs, threads, file sharing, emoji reactions, pins, presence indicators, read receipts, Cmd+K switcher, and board/task integration.
- **AI Features** — Groq-powered chat with @entity mentions, proactive anomaly detection (8 analyzers), intent classification, Vectorize semantic search, LoRA adapter management, and training data pipeline.
- **Time Tracking** — Task-level time logging, weekly timesheets, and manager approval workflows.
- **Smart Watch & Notifications** — Board / item / column subscriptions with reason tags, AI-prioritised inbox, daily digest narrative (Groq), snooze, quiet hours, semantic keyword subscriptions (Vectorize), auto-watch on participation, auto-acknowledge for assignments, plus email templates (Resend) and automation recipes.
- **Client Portal** — Separate auth system with cookie-based sessions, permission-gated views for projects, approvals, invoices, and gallery.

## Tech Stack

### Frontend
- Nuxt 4 (Vue 3, Composition API, `<script setup>`, TypeScript)
- Nuxt UI v4 — component library
- VueUse — utility composables
- Unovis — charts and data visualisation
- Lucide icons via `@iconify-json/lucide`
- date-fns v4 + `@internationalized/date`

### Backend (Nitro)
- Neon Serverless Postgres (`@neondatabase/serverless`)
- Xero API (`xero-node`) — accounting integration
- Meta Graph API + Google Ads REST API — ad platform spend
- Resend — transactional email
- Groq SDK — AI/LLM features
- Zod — runtime validation

### Infrastructure (Cloudflare)
- **Cloudflare Pages** — hosting (`nitro.preset: 'cloudflare_pages'`)
- **Cloudflare R2** — object storage (file uploads, exports)
- **Cloudflare Workers** — edge functions (email worker, queue consumer)
- **Cloudflare KV** — edge caching for tokens, sessions, reports
- **Cloudflare Queues** — background job processing with retry and DLQ
- **Cloudflare Durable Objects** — real-time chat rooms and board events
- **Cloudflare AI** — edge inference (`@cf/meta/llama-3.1-8b-instruct`)
- **Cloudflare Vectorize** — semantic search index
- **Wrangler CLI** — deploy tooling

## Project Structure

```
app/
  components/       # Auto-imported Vue components (nested folders become prefixes)
  composables/      # Auto-imported composables (useFetch, useAuth, useChat, etc.)
  layouts/          # Page layouts (agency.vue, portal.vue)
  middleware/       # Route middleware (auth.global.ts, portal-auth.ts)
  pages/            # File-based routing
    agency/         # Staff-facing pages (boards, clients, chat, AI, time tracking)
    portal/         # Client portal pages (projects, approvals, invoices)
    auth/           # Authentication pages
  types/            # TypeScript types (index.ts for runtime, index.d.ts for extended)
server/
  api/
    agency/         # Staff API endpoints (JWT auth via requireAuth)
    portal/         # Client API endpoints (cookie auth via requireClientAuth)
  database/
    schema*.sql     # Base schema files (~28 domain schemas)
    migrations/     # Numbered migrations (001–025)
  utils/            # Server utilities (db.ts, auth.ts, clientAuth.ts, etc.)
workers/
  ai-agent-worker/  # Proactive AI analysis worker
  board-events/     # BoardRoom Durable Object (real-time board collaboration)
  chat-rooms/       # ChatRoom Durable Object (real-time chat)
  email-worker/     # Inbound email processing (Cloudflare Email Routing)
```

## Getting Started

### Prerequisites

- Node.js 24.x (see `.nvmrc`)
- pnpm >= 10
- Xero developer account with an OAuth 2.0 app configured
- Neon Postgres database

### Clone & Install

```bash
git clone https://github.com/adme-dev/dashboard.git
cd dashboard
pnpm install
cp .env.example .env
```

Populate `.env` with the values described below.

### Required Environment Variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string |
| `XERO_CLIENT_ID` | OAuth client ID from Xero developer portal |
| `XERO_CLIENT_SECRET` | OAuth client secret |
| `XERO_REDIRECT_URI` | Callback path (`/api/xero/callback`) |
| `SESSION_SECRET` | Random string for cookie/session signing |
| `GROQ_API` | Groq API key for AI features |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `EMAIL_FROM` | Sender address for outbound email |
| `APP_URL` | Application URL (`http://localhost:3000` for dev) |

Optional variables for Cloudflare services (R2, KV, Queues, AI, Vectorize) are documented in `.env.example`. Local dev works without them via graceful degradation.

### Database Setup

Run the base schema followed by migrations against your Neon database:

```bash
# Run base schema (start with schema.sql, then domain schemas as needed)
psql $DATABASE_URL -f server/database/schema.sql

# Run migrations in order
psql $DATABASE_URL -f server/database/migrations/001-board-groups.sql
# ... through 025-ai-chat-pins.sql
```

### Run Locally

```bash
pnpm dev
```

The app starts on http://localhost:3000. Cloudflare bindings (KV, Queues, AI, Vectorize, Durable Objects) are optional in dev — features degrade gracefully when unavailable.

### Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start dev server on port 3000 |
| `pnpm build` | Production build (uses `--max-old-space-size=8192`) |
| `pnpm preview` | Preview production build locally |
| `pnpm test` | Run Vitest tests |
| `pnpm lint` | Lint with ESLint |
| `pnpm typecheck` | Run Nuxt type checking |

## Deploying to Cloudflare Pages

The project is configured for Cloudflare Pages via `wrangler.toml`.

1. Connect the repo in the Cloudflare dashboard under **Workers & Pages > Create > Pages > Connect to Git**.
2. Set build command to `pnpm build` and output directory to `dist`.
3. Add environment variables in **Settings > Variables and Secrets** for both preview and production.
4. Cloudflare bindings (KV, Queues, AI, Vectorize, Durable Objects) are configured in `wrangler.toml`.
5. To deploy from the CLI:

   ```bash
   npx wrangler pages deploy dist
   ```

### Cloudflare Bindings Setup

```bash
# KV namespace for caching
npx wrangler kv namespace create CACHE

# Queue for background jobs
npx wrangler queues create agency-jobs
npx wrangler queues create agency-jobs-dlq

# Vectorize index for semantic search
npx wrangler vectorize create agency-search --dimensions=768 --metric=cosine
```

Durable Objects (ChatRoom, BoardRoom) are deployed as separate workers under `workers/`.

### Workers Deployment

Each worker under `workers/` has its own `wrangler.toml` and deploys independently:

```bash
cd workers/chat-rooms && npx wrangler deploy
cd workers/board-events && npx wrangler deploy
cd workers/email-worker && npx wrangler deploy
cd workers/ai-agent-worker && npx wrangler deploy
```

## Key Conventions

### Authentication

- **Staff**: JWT-based via `requireAuth(event)` — returns `User` or throws 401. Use `requireRole(event, ['admin', 'owner'])` for RBAC.
- **Client Portal**: Cookie-based (`client_session_token`) via `requireClientAuth(event)` — returns `ServerClientUser` with `.clientId` and `.permissions`.
- Staff endpoints live under `server/api/agency/`, client endpoints under `server/api/portal/`.

### API Patterns

```ts
// Typical API endpoint
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const query = getQuery(event)

  const rows = await queryRows('SELECT ...', [id])
  return rows
})
```

### Server Imports

Server utilities use the Nitro double-tilde alias:

```ts
import { queryRows } from '~~/server/utils/db'    // correct
import { queryRows } from '~/server/utils/db'      // wrong
```

### Frontend Data Fetching

```ts
// Reads (reactive, SSR-compatible)
const { data } = await useFetch('/api/agency/tasks')

// Mutations
await $fetch('/api/agency/tasks', { method: 'POST', body: { ... } })

// User feedback
const toast = useToast()
toast.add({ title: 'Saved', color: 'success' })
```

### Types

Types must be defined in `app/types/index.ts` (not `.d.ts`) to be importable at runtime. TypeScript resolves `.ts` over `.d.ts`.

## Known Issues

- **Build OOM**: `nuxi build` can crash with memory exhaustion. The build script already uses `--max-old-space-size=8192` but may still fail on constrained machines.
- **Pre-existing TS errors**: ~60+ type errors exist in components that import types from `index.d.ts` instead of `index.ts`. Running `pnpm typecheck` will surface these — they don't block the build.

## Credits

Originally based on the [Nuxt UI Dashboard template](https://github.com/nuxt-ui-templates/dashboard). Extended and maintained by the ADME engineering group.
