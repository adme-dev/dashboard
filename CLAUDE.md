# CLAUDE.md — Agency Dashboard

## Application Purpose

This is **XeroFlow Agency** — an internal operations dashboard for a digital marketing agency. It manages:

- **Work Management**: Boards (Monday.com-style with 20+ column types), workflows, tasks, subtasks, Kanban, timeline, calendar, gallery views
- **Client & Project Management**: Clients, briefs, proofs, intake forms, project tracking
- **Financial Operations**: Xero integration (invoices, expenses, profit & loss), cashflow forecasting, end-of-month (EOM) invoice generation engine
- **Ad Spend Tracking**: Meta Ads and Google Ads integrations — OAuth connections, spend syncing, daily/campaign breakdowns, budget management with audit trails
- **Lead Capture & Routing**: real-time inbound lead inbox at `/agency/leads`. Native Google Ads webhooks (per-client URL+key), Meta verify-token endpoint (live; full ingestion gated by Meta App Review for `leads_retrieval`), generic webhook for Zapier/Make/n8n/custom (`/api/leads/webhook/generic/<token>`), CSV importer for Meta Lead Center exports, and manual entry. Form rules fan out to Slack / email / outbound webhook / Google Sheets / client portal / auto-assign user. Per-destination filters (`field_data.budget gt 5000`), delays up to 24h, idempotency by `source_lead_id`, `is_test` flagging hides Google "Send test data" from default inbox view. Form picker dropdown via OAuth (Google fully working today; Meta gated). OAuth-based `pages_show_list,pages_manage_ads,leads_retrieval,business_management` scope set requested — activation only requires the operator to reconnect each Meta account post-approval. See `server/api/leads/`, `server/utils/leads/`, `app/components/leads/`. Migrations 087, 090, 091.
- **Smart Watch & Notifications**: Board / item / column subscriptions with reason tags (`mentioned` / `assigned` / `watching_*`), per-event filtering, snooze, quiet hours / DND, AI importance scoring + Workers AI refinement, daily digest with Groq narrative, semantic keyword subs (Vectorize bge-base-en), auto-watch on participation, auto-acknowledge drafts (Groq). Email templates (Resend) + automation recipes layer on top. See `server/utils/notifications.ts`, `server/utils/subscriptions.ts`, `server/utils/quietHours.ts`, `server/utils/notificationImportance.ts`, `server/utils/keywordSubscriptions.ts`. Migrations 077–081.
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
| `<input type="date">` | `UPopover` + `UCalendar` (see Form Design below) |
| `<button>` | `UButton` |
| `<dialog>` | `UModal` or `USlideover` |
| `<table>` for data | `UTable` (or custom table with proper styling) |

### Key Nuxt UI v4 Components
`UButton`, `UInput`, `UTextarea`, `UCheckbox`, `USelect`, `USelectMenu`, `UBadge`, `UAvatar`, `UIcon`, `UModal`, `USlideover`, `UPopover`, `UDropdownMenu`, `UTooltip`, `UCalendar`, `UFormField`, `UTable`, `UTabs`, `UAccordion`, `UAlert`, `UCard`, `UPagination`

### Form Design (MANDATORY)

**Whenever you build or edit a form, first invoke the `frontend-design` skill** at `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md` and apply its design principles (typography, hierarchy, spacing, avoiding generic AI aesthetics) before writing or modifying any form fields. This is non-negotiable for any form-touching work in this project.

Project-specific conventions on top of that skill:
- **Labels** — wrap every field in `UFormField` with a `label` prop; never hand-roll `<p class="text-xs text-muted">Label</p>` above an input. UFormField handles label/help-text/error spacing consistently.
- **Date inputs** — never use `<UInput type="date">` (browser-native, ugly, no dark-mode polish). Use the `UPopover` + `UCalendar` pattern with `@internationalized/date` (`CalendarDate`, `getLocalTimeZone`). See `app/components/workflow/TaskCreateDialog.vue` for the canonical implementation including the `toCalendarDate()` ISO ↔ CalendarDate helper.
- **Field grids** — paired controls (e.g. status/priority, due/snooze) sit in `grid grid-cols-2 gap-4` with consistent vertical rhythm; never mix grid sizes or gaps within the same form section.
- **Clear / reset affordances** — never bake clear buttons into the label row (breaks alignment); place a small ghost `UButton` inside the popover footer (`<template #content>`) instead.

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

## Deployment

Deploy to Cloudflare Pages via Wrangler:

```bash
# Production (branch: main)
pnpm deploy:production

# Preview (branch: preview)
pnpm deploy:preview

# Default (no branch specified)
pnpm deploy
```

The deploy scripts run `pnpm build` then `wrangler pages deploy` from the `dist/` directory to the `agency-dashboard` project. Cloudflare Pages uses `--branch` (not `--env`) to target environments.

**Deployment target safety:** Never run `wrangler pages deploy` directly from this repository and never supply a different `--project-name`. Always use the `pnpm deploy:*` commands, which execute `scripts/deploy-pages.mjs` and fail closed unless both `wrangler.toml` and the immutable target equal `agency-dashboard`. Before any manual or CI deployment, `pnpm deploy:check` must pass. This guard exists because three XeroFlow builds were accidentally deployed to the separate dealer-network Pages project on 2026-07-13; DNS and domain bindings were not at fault. See `docs/incidents/2026-07-13-dealer-network-pages-cross-deployment.md`.

The build's heap limit is set **inside** the `build` script (`NODE_OPTIONS='--max-old-space-size=16384' nuxt build`), so prefixing your own `NODE_OPTIONS` on the deploy command is ignored — change the value in `package.json` if you need to adjust it. The Nitro server bundle needs ~8.2 GB, so anything ≤ 8 GB OOMs.

## Known Issues
- Production build needs a large heap — the `build` script sets `--max-old-space-size=16384`; the Nitro server bundle OOMs at ≤ 8 GB. The limit is a ceiling (not a reservation), so it's safe on smaller machines as long as physical RAM exceeds the ~9 GB actual peak.
- ~60+ pre-existing TS errors from types only in `index.d.ts` not `index.ts`
- `typescript.strict: false` in nuxt.config — don't enable without a migration plan

## Anomalies overhaul — deploy runbook

The order matters. **Don't skip steps 1 or 2** — together they prevent a flood of critical-severity emails on the first cron run for problems that have been ongoing.

### 1. Pre-deploy: set the recipient allowlist on Cloudflare Pages

Workers & Pages → `agency-dashboard` → Settings → Environment Variables → Production:

- `ANOMALY_NOTIFY_ALLOWLIST` → `paul@adme.net.au` (start with just the owner)

This caps notification fan-out to the listed emails regardless of role. Broaden later as you build confidence; unset to fan out to all FINANCE-permission staff.

### 2. Deploy

```bash
pnpm deploy:production
```

This runs migrations 085 + 086 implicitly (they're additive — `IF NOT EXISTS` guards on every CREATE) the next time anything hits the DB. **No notifications fire yet** because the cron trigger isn't enabled.

### 3. Backfill (notifications suppressed)

Run from the worktree root with the dev server running locally (or set `BACKFILL_BASE_URL` to a deployed origin):

```bash
pnpm dev   # in another terminal — sharedData.ts hits Nitro routes via $fetch
ANOMALY_NOTIFICATIONS_DISABLED=true \
  pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/anomaly-backfill.ts
```

The `--tsconfig .nuxt/tsconfig.server.json` flag is required so tsx can resolve the `~~/` Nuxt alias. The `ANOMALY_NOTIFICATIONS_DISABLED=true` flag is the safety guard — the script refuses to run without it.

### 4. Verify the table populated

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -c "SELECT type, severity, COUNT(*) FROM anomalies WHERE status NOT IN ('resolved','dismissed') GROUP BY type, severity"
```

Expect rows across multiple types if the org has real Xero data. Empty result is also fine — means nothing's anomalous right now.

### 5. Enable the cron trigger in the Cloudflare dashboard

Workers & Pages → `agency-dashboard` → Settings → Triggers → Cron:

- Schedule: `0 * * * *` (the handler self-gates to 7am tenant-local time)
- Targets POST `/api/cron/anomaly-detection` with header `x-cron-secret: $CRON_SECRET`

After enabling, only genuinely-new anomalies (post-backfill) trigger notifications. The first email will land at the next 7am local for the connected org.

### 6. Broaden the allowlist over time

Once you've confirmed notifications are well-behaved (a week or two of data):

- Add more emails to `ANOMALY_NOTIFY_ALLOWLIST`, OR
- Unset the env var entirely to fan out to every FINANCE-permission user.

### Rollback

If anything goes wrong:

- **Stop notifications immediately**: set `ANOMALY_NOTIFICATIONS_DISABLED=true` on the deployed env, redeploy. Cron + manual scans still run, just no fan-out.
- **Stop detection entirely**: disable the cron trigger in the CF dashboard. The page still works (reads from the persisted table).
- **Revert the migration**: 085 + 086 are additive; safe to leave in place even if the rest of the feature is rolled back.
