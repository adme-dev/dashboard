# CLAUDE.md — Agency Dashboard

## Application Purpose

This is **XeroFlow Agency** — an internal operations dashboard for a digital marketing agency. It manages:

- **Work Management**: Boards (Monday.com-style with 20+ column types), workflows, tasks, subtasks, Kanban, timeline, calendar, gallery views
- **Client & Project Management**: Clients, briefs, proofs, intake forms, project tracking
- **Financial Operations**: Xero integration (invoices, expenses, profit & loss), cashflow forecasting, end-of-month (EOM) invoice generation engine
- **Ad Spend Tracking**: Meta Ads and Google Ads integrations — OAuth connections, spend syncing, daily/campaign breakdowns, budget management with audit trails
- **Notifications & Automations**: In-app notifications, email templates (Resend), board subscriptions, automation recipes (trigger → action)
- **AI Features**: Groq-powered AI chat, anomaly detection, recommendations

The primary users are agency staff — account managers, media buyers, producers, and finance.

## Tech Stack

### Frontend
- **Nuxt 4** (Vue 3, Composition API, `<script setup>`)
- **Nuxt UI v4** — the component library for ALL UI elements (see UI Rules below)
- **VueUse** — utility composables
- **Unovis** — charts and data visualisation
- **Lucide icons** via `@iconify-json/lucide` (e.g. `i-lucide-chevron-down`)
- **date-fns** v4 — date manipulation
- **@internationalized/date** — timezone-aware calendar operations (used with `UCalendar`)

### Backend (Nitro)
- **Neon Serverless Postgres** (`@neondatabase/serverless`) — all DB queries via `server/utils/db.ts`
- **Xero API** (`xero-node`) — accounting integration
- **Meta Graph API** and **Google Ads REST API** — ad platform spend syncing
- **Resend** — transactional email
- **Groq SDK** — AI/LLM features
- **Zod** — runtime validation

### Infrastructure (Cloudflare)
- **Cloudflare Pages** — hosting and deployment (`nitro.preset: 'cloudflare_pages'`)
- **Cloudflare R2** — object storage (file uploads, EOM archive exports)
- **Cloudflare Workers** — edge functions (email-worker for inbound email processing)
- **Cloudflare D1, KV, Durable Objects, Queues, AI, etc.** — available for use as needed
- **Wrangler CLI** — deploy tooling (`wrangler pages deploy`)

### Testing
- **Vitest** — unit and integration tests
- **happy-dom** — DOM environment for tests

## UI Rules (MANDATORY)

**Always use Nuxt UI v4 components.** Never use browser-native dialogs or raw HTML form elements.

| Instead of | Use |
|---|---|
| `confirm()` | `UModal` with confirmation content |
| `alert()` | `useToast()` or `UModal` |
| `prompt()` | `UModal` with `UInput` inside |
| `<select>` | `USelectMenu` or `USelect` |
| `<input>` | `UInput` |
| `<button>` | `UButton` |
| `<dialog>` | `UModal` or `USlideover` |
| `<table>` for data | `UTable` (or custom table with proper styling) |

### Key Nuxt UI v4 Components
`UButton`, `UInput`, `UTextarea`, `UCheckbox`, `USelect`, `USelectMenu`, `UBadge`, `UAvatar`, `UIcon`, `UModal`, `USlideover`, `UPopover`, `UDropdownMenu`, `UTooltip`, `UCalendar`, `UTable`, `UTabs`, `UAccordion`, `UAlert`, `UCard`, `UPagination`

### Toasts
```ts
const toast = useToast()
toast.add({ title: 'Success', description: '...', color: 'success' })
toast.add({ title: 'Error', description: '...', color: 'error' })
```

### Modal Pattern (for confirmations)
```vue
<script setup>
const showModal = ref(false)
</script>
<template>
  <UModal v-model:open="showModal">
    <template #content>
      <!-- modal body -->
    </template>
  </UModal>
</template>
```

## Code Conventions

### API Endpoints (Nitro)
- Auth: `requireAuth(event)` returns User or throws 401. `requireRole(event, roles[])` for RBAC.
- Params: `getRouterParam(event, 'id')`, `readBody(event)`, `getQuery(event)`
- Errors: `createError({ statusCode, statusMessage })`
- DB: `queryRows()`, `queryOne()`, `execute()`, `transaction()` from `server/utils/db.ts`
- Server imports use `~~/server/utils/` (Nitro double-tilde alias), NOT `~/server/utils/`

### Frontend
- Data fetching: `useFetch()` for reads, `$fetch()` for mutations
- Types: defined in `app/types/index.ts` (runtime). TS resolves `.ts` over `.d.ts` — types must be in `index.ts` to be importable.
- Composables: `app/composables/` — auto-imported by Nuxt
- Components: `app/components/` — auto-imported, nested folders become prefixes (e.g. `social/SpendChart.client.vue` → `SocialSpendChart`)
- `.client.vue` suffix for client-only components (charts, browser APIs)

### Styling
- Tailwind CSS via Nuxt UI — use utility classes
- Dark mode supported — always use semantic colors (`text-muted`, `bg-elevated`, `border-default`) over hardcoded colors
- Responsive: mobile-first, use `sm:`, `md:`, `lg:` breakpoints

### Dark Mode on Marketing / Public Pages
- `colorMode.preference` is `'dark'` — dark mode is the **default** for all users
- Marketing pages (`layout: false`, `public: true`) use hardcoded hex colors (e.g. `text-[#121317]`, `bg-[#f4f5f7]`) — every such color **must** have a `dark:` variant (e.g. `text-[#121317] dark:text-white`, `bg-[#f4f5f7] dark:bg-white/[0.03]`)
- Always-dark sections (hero, CTA, showcase) use `bg-[#0a0b0e]` with white text — no `dark:` variant needed since they look the same in both modes
- Ad preview components (`MetaFeedPreview`, `LinkedInPreview`, etc.) intentionally use hardcoded `bg-white text-black` — they are platform mockups and must NOT change in dark mode
- Common dark-mode color pairs: `text-[#121317]` → `dark:text-white`, `text-[#45474D]` → `dark:text-white/50`, `bg-[#f4f5f7]` → `dark:bg-white/[0.03]`, `border-[#121317]/[0.06]` → `dark:border-white/[0.06]`
- Status colors need `dark:` variants for contrast: `text-emerald-600` → `dark:text-emerald-400`, `text-blue-600` → `dark:text-blue-400`

## Cloudflare Products Available

We are fully on the Cloudflare network. These products are available and should be considered when relevant:

- **Pages** — current hosting (in use)
- **R2** — S3-compatible object storage (in use)
- **Workers** — serverless edge functions (in use for email worker)
- **D1** — serverless SQLite databases
- **KV** — key-value storage (global, eventually consistent)
- **Durable Objects** — stateful coordination (real-time collaboration, WebSockets)
- **Queues** — message queues for async processing
- **AI** — inference at the edge (Workers AI models)
- **Images** — image transformation and CDN delivery
- **Stream** — video storage and streaming
- **Browser Rendering** — headless Chromium at the edge
- **Vectorize** — vector database for embeddings
- **Hyperdrive** — connection pooling for Postgres (useful with Neon)
- **Pub/Sub** — MQTT messaging
- **Email Routing** — inbound email handling (in use)
- **Turnstile** — CAPTCHA alternative
- **Zero Trust / Access** — identity-aware proxy and SSO

## Front-Facing Page Sync

**When adding or updating features in the platform, always update the relevant public/marketing pages:**
1. `app/pages/features/index.vue` — add the feature to the correct category (or create a new one)
2. `app/pages/features/[slug].vue` — add a detailed feature entry with 3-4 content sections
3. `app/components/MarketingNav.vue` — update the mega menu if the feature belongs in a top-level nav category
4. Any other marketing pages that reference feature lists or counts (e.g. SEO descriptions, pricing page comparisons)

These pages are the public face of the product. Features that exist in the codebase but not on the marketing site are invisible to potential users. Keep them in sync as part of the implementation workflow, not as an afterthought.

## Pre-Commit Quality Rules

**Before committing any feature or multi-file change, always run a deep-dive review / battle test:**
1. Re-read every modified and new file end-to-end
2. Check for import alias mismatches (`~/` vs `~~/` for server code)
3. Verify USelectMenu values are never empty strings (use sentinels like `'all'` or `'__custom__'`)
4. Confirm computed/ref reactivity — e.g. dropdown "Custom" selections actually trigger the custom input to appear
5. Look for duplicate UI sections introduced by edits (e.g. align buttons rendered twice)
6. Validate CSS value construction — hex colors appended with alpha need 6-char base (`#abc` → `#aabbcc` first)
7. Check for SSRF vectors in any server-side URL fetching (block localhost, private IPs)
8. Ensure server endpoints don't import frontend-only modules (`~/utils/*` won't resolve in Nitro — use `~~/` or inline)

This review must happen **before** any commit, not after. Catching bugs post-commit wastes cycles.

## Database Migrations

When creating or modifying SQL migration files in `server/database/migrations/`, **always run them automatically** against the database. Load the connection string from `.env`:

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/<migration-file>.sql
```

Do not wait for the user to run migrations manually — execute them as part of the implementation workflow.

## Known Issues
- `nuxi build` crashes with OOM (even at 4GB) — pre-existing, use `NODE_OPTIONS='--max-old-space-size=8192'`
- ~60+ pre-existing TS errors from types only in `index.d.ts` not `index.ts`
- `typescript.strict: false` in nuxt.config — don't enable without a migration plan
