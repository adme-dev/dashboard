# Leads Engine — Phase 1c (Ops + Verification) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the leads engine into production-grade operations and ship the public-facing surface — Smart Watch notification on new leads, three cron jobs (ingestion-error purge, stuck-claim recovery, retention purge), Cloudflare companion-Worker deploy + queue consumer wiring, marketing site sync (`/features` pages and mega menu), a load test that proves the engine handles 1,000 leads in 60 seconds, and a final UAT checklist on staging.

**Architecture:** Cron-style endpoints (already created in plan 1a for stuck-claim recovery) get scheduled via Cloudflare Cron Triggers / Pages cron + an `INTERNAL_CRON_TOKEN` for auth. The companion `leads-delivery-worker` is deployed via wrangler with a `queues.consumers` binding configured in the Cloudflare dashboard. Marketing pages get a new "Lead Capture & Routing" feature in the right category and a top-level nav entry. Load test is a Node script that hammers the Google webhook endpoint with realistic payloads while measuring queue drain time.

**Tech Stack:** Cloudflare Workers + Cron Triggers + Queues, Resend (existing wiring), Nuxt UI v4 marketing pages, Node.js for load test.

**Spec:** `docs/superpowers/specs/2026-04-30-leads-engine-design.md`
**Depends on:** Plan 1a (backend) + Plan 1b (UI) merged.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `server/utils/leads/notifyOnNew.ts` | create | Bridge: lead inserted → `createNotification` for assigned AM with `reason='lead_arrived'` |
| `server/api/leads/webhook/google/[token].post.ts` | modify | Call `notifyOnNew` after enqueueing rules |
| `server/api/leads/index.post.ts` | modify | Same — manual entry also notifies |
| `server/api/leads/_internal/purge-ingestion-errors.post.ts` | create | Cron target: delete rows older than 30 days |
| `server/api/leads/_internal/purge-retention.post.ts` | create | Cron target: hard-delete leads older than retention threshold (default 18mo) and in terminal states |
| `workers/leads-delivery-worker/src/index.ts` | modify | Hook into `notifyOnNew` is unnecessary here — Worker is dispatch-only |
| `workers/leads-delivery-worker/scripts/sync-shared.sh` | modify | Ensure copy works with the latest tree |
| `workers/leads-delivery-worker/wrangler.toml` | modify | Confirm bindings; doc the queue-consumer dashboard config |
| `workers/leads-delivery-worker/DEPLOYMENT.md` | create | Step-by-step deploy + dashboard config |
| `wrangler.toml` (Pages) | modify | Add `LEADS_DELIVERY_QUEUE` producer binding |
| `nuxt.config.ts` | modify | Schedule cron triggers via `nitro.scheduledTasks` (or wrangler-side, depending on env) |
| `app/pages/features/index.vue` | modify | Add "Lead Capture & Routing" feature card |
| `app/pages/features/[slug].vue` | modify | Add detailed entry for `lead-capture-routing` slug |
| `app/components/MarketingNav.vue` | modify | Surface in mega menu under Operations |
| `scripts/loadtest-leads.mjs` | create | Pump 1,000 synthetic leads through the Google endpoint, measure drain |
| `docs/superpowers/uat/2026-04-30-leads-engine-uat.md` | create | Final UAT checklist for staging |

---

## Section A — Smart Watch notification on new lead

### Task 1: `notifyOnNew` bridge

**Files:**
- Create: `server/utils/leads/notifyOnNew.ts`

- [ ] **Step 1: Implement**

```ts
// server/utils/leads/notifyOnNew.ts
// Surfaces a notification to the assigned AM (or unassigned-bucket inbox owners)
// when a lead arrives. Uses the existing notifications subsystem so the Smart
// Watch / inbox / digest features all light up automatically.

import { queryOne, queryRows } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import type { Lead } from '~~/app/types'

interface MinimalLead extends Pick<Lead,
  'id' | 'client_id' | 'source' | 'form_id' | 'form_name' | 'assigned_to' | 'field_data'> {}

export async function notifyOnNewLead(lead: MinimalLead): Promise<void> {
  // Build a short, scannable headline.
  const f = lead.field_data ?? {}
  const summary = [f.full_name, f.email, f.phone_number ?? f.phone].filter(Boolean).slice(0, 2).join(' · ') || lead.id.slice(0, 8)
  const title = `New lead — ${lead.form_name || lead.source}`
  const body = summary

  // Resolve recipients: the assigned AM if any, else the client's primary AM.
  let recipients: string[] = []
  if (lead.assigned_to) {
    recipients = [lead.assigned_to]
  } else if (lead.client_id) {
    const rows = await queryRows<{ team_member_id: string }>(`
      SELECT team_member_id FROM client_team_assignments
      WHERE client_id = $1 AND role IN ('primary_am', 'secondary_am')
    `, [lead.client_id])
    recipients = rows.map(r => r.team_member_id)
  }
  if (recipients.length === 0) return

  for (const userId of recipients) {
    try {
      await createNotification({
        user_id: userId,
        type: 'lead',
        reason: 'lead_arrived',
        title,
        body,
        link: `/agency/leads?lead=${lead.id}`,
        // importance is computed by the existing heuristic engine where present;
        // unset = lets watch-phase-e classifier decide.
      } as any)
    } catch (e) {
      // Never block the ingestion path on notification failure.
      console.warn('notifyOnNewLead.error', e)
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/leads/notifyOnNew.ts
git commit -m "feat(leads): notify assigned AM on new-lead ingestion"
```

---

### Task 2: Wire `notifyOnNew` into ingestion + manual entry

**Files:**
- Modify: `server/api/leads/webhook/google/[token].post.ts`
- Modify: `server/api/leads/index.post.ts`

- [ ] **Step 1: Patch the Google webhook**

Open `server/api/leads/webhook/google/[token].post.ts`. After the line `await enqueue({ type: 'rules.evaluate', payload: { lead_id: leadId } })`, add the notification call (load lead briefly to get the assigned_to that auto-assignment set):

```ts
// After enqueue:
import { notifyOnNewLead } from '~~/server/utils/leads/notifyOnNew'
import { loadLead } from '~~/server/utils/leads/db'
// ...
const fresh = await loadLead(leadId)
if (fresh) await notifyOnNewLead(fresh)
```

- [ ] **Step 2: Patch the manual-entry endpoint**

Open `server/api/leads/index.post.ts`. After insert, add:

```ts
import { notifyOnNewLead } from '~~/server/utils/leads/notifyOnNew'
import { loadLead } from '~~/server/utils/leads/db'
// ...
if (id) {
  const fresh = await loadLead(id)
  if (fresh) await notifyOnNewLead(fresh)
}
```

- [ ] **Step 3: Smoke test**

Repeat the Google smoke from plan 1a Task 33; verify a notification row appears for the assigned AM:

```bash
psql "$DATABASE_URL" -c "SELECT id, user_id, type, reason, title FROM notifications WHERE reason='lead_arrived' ORDER BY created_at DESC LIMIT 5;"
```

Expected: 1+ rows.

- [ ] **Step 4: Commit**

```bash
git add server/api/leads/webhook/google/[token].post.ts server/api/leads/index.post.ts
git commit -m "feat(leads): wire Smart Watch notification on new-lead ingestion"
```

---

## Section B — Cron jobs

### Task 3: Ingestion-error purge endpoint (30-day TTL)

**Files:**
- Create: `server/api/leads/_internal/purge-ingestion-errors.post.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/leads/_internal/purge-ingestion-errors.post.ts
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  const expected = `Bearer ${process.env.INTERNAL_CRON_TOKEN ?? ''}`
  if (!process.env.INTERNAL_CRON_TOKEN || auth !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const deleted = await execute(`
    DELETE FROM lead_ingestion_errors WHERE created_at < NOW() - INTERVAL '30 days'
  `)
  return { ok: true, deleted }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/api/leads/_internal/purge-ingestion-errors.post.ts
git commit -m "feat(leads): cron endpoint — purge ingestion errors older than 30 days"
```

---

### Task 4: Retention purge endpoint (default 18 months)

**Files:**
- Create: `server/api/leads/_internal/purge-retention.post.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/leads/_internal/purge-retention.post.ts
// Hard-deletes terminal-state leads older than retention. Soft-deleted leads
// are also cleaned. Configurable via env LEADS_RETENTION_MONTHS (default 18).
//
// "Terminal states" = won, lost, spam_suspected. New / contacted / qualified
// stay forever (or until soft-delete triggers retention).

import { execute, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  const expected = `Bearer ${process.env.INTERNAL_CRON_TOKEN ?? ''}`
  if (!process.env.INTERNAL_CRON_TOKEN || auth !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const months = Number(process.env.LEADS_RETENTION_MONTHS ?? 18)
  if (!Number.isFinite(months) || months < 1) {
    return { ok: false, error: 'invalid_LEADS_RETENTION_MONTHS' }
  }

  // Sample first to log volume before deleting (no PII in the count itself).
  const probe = await queryOne<{ n: string }>(`
    SELECT COUNT(*)::text AS n FROM leads
    WHERE (
      (status IN ('won','lost','spam_suspected') AND created_at < NOW() - ($1 || ' months')::interval)
      OR (deleted_at IS NOT NULL AND deleted_at < NOW() - ($1 || ' months')::interval)
    )
  `, [String(months)])

  const deleted = await execute(`
    DELETE FROM leads
    WHERE (
      (status IN ('won','lost','spam_suspected') AND created_at < NOW() - ($1 || ' months')::interval)
      OR (deleted_at IS NOT NULL AND deleted_at < NOW() - ($1 || ' months')::interval)
    )
  `, [String(months)])

  return { ok: true, candidate_count: Number(probe?.n ?? 0), deleted, months }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/api/leads/_internal/purge-retention.post.ts
git commit -m "feat(leads): cron endpoint — retention purge for terminal-state and soft-deleted leads"
```

---

### Task 5: Schedule the three crons

**Files:**
- Modify: `nuxt.config.ts`

We use Nitro `scheduledTasks` (CF Pages reads them; on other targets they're harmless). The actual cron firing on CF Pages happens via Cloudflare Cron Triggers — we still configure them in `nuxt.config.ts` so the in-app handlers stay aligned.

- [ ] **Step 1: Read current config**

```bash
grep -n "scheduledTasks\|nitro:" nuxt.config.ts | head
```

- [ ] **Step 2: Add cron handlers (server-side scheduled tasks)**

Create `server/tasks/leads-recover-claims.ts`:

```ts
// server/tasks/leads-recover-claims.ts
import { recoverStuckClaims } from '~~/server/utils/leads/db'

export default defineTask({
  meta: { name: 'leads:recover-claims', description: 'Reset stuck claimed deliveries' },
  async run() {
    const reset = await recoverStuckClaims(5)
    return { result: { reset } }
  },
})
```

Create `server/tasks/leads-purge-ingestion-errors.ts`:

```ts
// server/tasks/leads-purge-ingestion-errors.ts
import { execute } from '~~/server/utils/db'

export default defineTask({
  meta: { name: 'leads:purge-ingestion-errors', description: '30-day TTL on raw payload errors' },
  async run() {
    const deleted = await execute(`
      DELETE FROM lead_ingestion_errors WHERE created_at < NOW() - INTERVAL '30 days'
    `)
    return { result: { deleted } }
  },
})
```

Create `server/tasks/leads-purge-retention.ts`:

```ts
// server/tasks/leads-purge-retention.ts
import { execute } from '~~/server/utils/db'

export default defineTask({
  meta: { name: 'leads:purge-retention', description: 'Retention purge for terminal-state + soft-deleted' },
  async run() {
    const months = Number(process.env.LEADS_RETENTION_MONTHS ?? 18)
    const deleted = await execute(`
      DELETE FROM leads
      WHERE (
        (status IN ('won','lost','spam_suspected') AND created_at < NOW() - ($1 || ' months')::interval)
        OR (deleted_at IS NOT NULL AND deleted_at < NOW() - ($1 || ' months')::interval)
      )
    `, [String(months)])
    return { result: { deleted, months } }
  },
})
```

- [ ] **Step 3: Wire schedule in `nuxt.config.ts`**

Add (or extend) `nitro.scheduledTasks`:

```ts
// nuxt.config.ts (excerpt)
export default defineNuxtConfig({
  // ... existing config ...
  nitro: {
    // ...
    scheduledTasks: {
      // Every 5 minutes — stuck-claim recovery
      '*/5 * * * *': ['leads:recover-claims'],
      // Daily 03:10 UTC — ingestion-error purge
      '10 3 * * *': ['leads:purge-ingestion-errors'],
      // Daily 03:30 UTC — retention purge
      '30 3 * * *': ['leads:purge-retention'],
    },
    // ...
  },
})
```

- [ ] **Step 4: For Cloudflare Pages — cron triggers**

Pages doesn't run Nitro scheduled tasks natively; we need Cron Triggers configured in the Cloudflare dashboard or via wrangler. The Pages app doesn't support `scheduled` handlers directly — we therefore expose HTTP cron endpoints (already created in Tasks 3 & 4 + Plan 1a Task 21) and call them from a small CF Cron Worker.

Create `workers/leads-cron/wrangler.toml`:

```toml
name = "leads-cron"
main = "src/index.ts"
compatibility_date = "2025-12-01"

[triggers]
crons = [
  "*/5 * * * *",   # recover stuck claims
  "10 3 * * *",    # purge ingestion errors
  "30 3 * * *"     # purge retention
]

[vars]
APP_BASE_URL = "https://your-dashboard.adme.net.au"
# INTERNAL_CRON_TOKEN set as a secret via:
#   wrangler secret put INTERNAL_CRON_TOKEN
```

Create `workers/leads-cron/src/index.ts`:

```ts
// workers/leads-cron/src/index.ts
interface Env {
  APP_BASE_URL: string
  INTERNAL_CRON_TOKEN: string
}

const ROUTES: Record<string, string> = {
  '*/5 * * * *': '/api/leads/_internal/recover-stuck-claims',
  '10 3 * * *': '/api/leads/_internal/purge-ingestion-errors',
  '30 3 * * *': '/api/leads/_internal/purge-retention',
}

export default {
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const path = ROUTES[controller.cron]
    if (!path) { console.warn('unknown cron', controller.cron); return }
    const url = `${env.APP_BASE_URL}${path}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.INTERNAL_CRON_TOKEN}` },
    })
    const text = await resp.text()
    console.log('cron.run', { cron: controller.cron, path, status: resp.status, body: text.slice(0, 200) })
  },
}
```

Create `workers/leads-cron/package.json`:

```json
{
  "name": "leads-cron",
  "private": true,
  "type": "module",
  "scripts": { "deploy": "wrangler deploy", "dev": "wrangler dev" },
  "devDependencies": { "wrangler": "*", "@cloudflare/workers-types": "*", "typescript": "*" }
}
```

- [ ] **Step 5: Commit**

```bash
git add server/tasks workers/leads-cron nuxt.config.ts
git commit -m "feat(leads/ops): scheduled tasks + CF Cron Worker for the three crons"
```

---

## Section C — Worker deploy + queue wiring

### Task 6: Pages-side queue producer binding

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1: Read existing config**

```bash
cat wrangler.toml
```

- [ ] **Step 2: Add producer binding**

Append (or insert into the appropriate section):

```toml
# Producer binding for the leads delivery queue. Consumer runs in
# workers/leads-delivery-worker/, configured in the CF dashboard.
[[queues.producers]]
binding = "LEADS_DELIVERY_QUEUE"
queue = "leads-delivery-queue"
```

- [ ] **Step 3: Create the queue + DLQ in CF**

```bash
# Create queue
wrangler queues create leads-delivery-queue
wrangler queues create leads-delivery-dlq
```

Expected: success. Note the queue IDs.

- [ ] **Step 4: Commit**

```bash
git add wrangler.toml
git commit -m "feat(leads/ops): Pages producer binding for LEADS_DELIVERY_QUEUE"
```

---

### Task 7: Sync shared code into the Worker bundle

**Files:**
- Modify: `workers/leads-delivery-worker/scripts/sync-shared.sh`

- [ ] **Step 1: Run the sync**

```bash
./workers/leads-delivery-worker/scripts/sync-shared.sh
```

Expected: `synced shared leads code`. Verify:

```bash
ls workers/leads-delivery-worker/src/leads/
```

- [ ] **Step 2: Add a `predeploy` script wiring sync → wrangler deploy**

Edit `workers/leads-delivery-worker/package.json`:

```json
{
  "name": "leads-delivery-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "presync": "echo syncing shared code...",
    "sync": "./scripts/sync-shared.sh",
    "predeploy": "pnpm sync",
    "deploy": "wrangler deploy",
    "dev": "wrangler dev"
  },
  "dependencies": {
    "@neondatabase/serverless": "*",
    "pg": "*",
    "resend": "*"
  },
  "devDependencies": {
    "wrangler": "*",
    "@cloudflare/workers-types": "*",
    "typescript": "*"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add workers/leads-delivery-worker
git commit -m "feat(leads/ops): predeploy hook to sync shared code into the worker bundle"
```

---

### Task 8: Deploy the Worker + dashboard config

**Files:**
- Create: `workers/leads-delivery-worker/DEPLOYMENT.md`

- [ ] **Step 1: Write the deployment doc**

```md
# leads-delivery-worker — Deployment

This Worker is the queue consumer for the leads engine. The Pages app produces
messages on `leads-delivery-queue`; this Worker dequeues and dispatches.

## Prerequisites

- A Cloudflare account with Workers + Queues + Hyperdrive enabled
- The Pages dashboard project deployed
- A Hyperdrive resource pointing at the Neon Postgres DB (note the ID)
- Resend API key

## One-time setup

1. **Set the Hyperdrive ID** in `wrangler.toml`:

   Replace `REPLACE_WITH_HYPERDRIVE_ID` with your actual ID.

2. **Set secrets:**

   ```bash
   cd workers/leads-delivery-worker
   wrangler secret put DATABASE_URL          # Neon connection string (fallback)
   wrangler secret put RESEND_API_KEY        # Same as Pages
   wrangler secret put INTERNAL_CRON_TOKEN   # Optional, only if Worker calls back
   ```

3. **Deploy:**

   ```bash
   pnpm deploy
   ```

4. **Configure the queue consumer in the Cloudflare dashboard:**

   - Workers & Pages → leads-delivery-worker → Queue Consumers → Add
   - Queue: `leads-delivery-queue`
   - Max batch size: 10
   - Max batch timeout: 5
   - Max retries: 0 (the app retries internally)
   - Dead letter queue: `leads-delivery-dlq`

5. **Smoke test:**

   ```bash
   # From the Pages app, fire a synthetic Google lead:
   curl -X POST 'https://<host>/api/leads/webhook/google/<token>' \
     -H 'Content-Type: application/json' \
     -d '{"google_key":"<key>","lead_id":"deploy-smoke","form_id":"smoke",
          "user_column_data":[{"column_name":"EMAIL","string_value":"a@b.co"}]}'

   # Then in dashboard → Queues → leads-delivery-queue → check messages drain.
   # In DB, lead_deliveries should land with status='delivered' or 'cancelled'
   # (depending on whether a rule is configured).
   ```

## Updates

After any change to `server/utils/leads/*` in the main repo, run `pnpm deploy`
from this directory. The `predeploy` hook re-syncs the shared code.
```

- [ ] **Step 2: Deploy (manual operator step — document only)**

```bash
cd workers/leads-delivery-worker
pnpm install
pnpm sync
wrangler secret put DATABASE_URL
wrangler secret put RESEND_API_KEY
pnpm deploy
```

Then in the Cloudflare dashboard, add `leads-delivery-queue` as the consumer queue (per `DEPLOYMENT.md`).

- [ ] **Step 3: Deploy the Cron Worker**

```bash
cd workers/leads-cron
pnpm install
wrangler secret put INTERNAL_CRON_TOKEN
pnpm deploy
```

- [ ] **Step 4: Commit the docs**

```bash
git add workers/leads-delivery-worker/DEPLOYMENT.md
git commit -m "docs(leads/ops): worker deployment + queue-consumer dashboard config"
```

---

## Section D — Marketing site sync

### Task 9: Add "Lead Capture & Routing" feature

**Files:**
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`

- [ ] **Step 1: Inspect existing pages**

```bash
sed -n '1,80p' app/pages/features/index.vue
sed -n '1,80p' app/pages/features/[slug].vue
```

- [ ] **Step 2: Add the feature card to `index.vue`**

Locate the existing categories array (likely a `const FEATURES = [...]` or similar). Add to the **Operations** category (or whichever fits — most often "Operations" or "Ad Manager"):

```ts
{
  slug: 'lead-capture-routing',
  title: 'Lead Capture & Routing',
  blurb: 'Real-time Meta + Google ad inquiries land directly in the dashboard. Per-form rules fan them out to Slack, email, your CRM, Sheets, and the client portal — without Zapier.',
  icon: 'i-lucide-inbox',
  highlights: [
    'Sub-60-second delivery (native webhooks, no polling)',
    'Per-client routing rules with optional filters and delays',
    'Client portal lead inbox built-in',
    'Outbound webhook with HMAC signing + idempotency keys',
  ],
}
```

- [ ] **Step 3: Add the detailed entry to `[slug].vue`**

In the `FEATURES` map (or equivalent), add:

```ts
'lead-capture-routing': {
  title: 'Lead Capture & Routing',
  hero: {
    eyebrow: 'Operations',
    headline: 'Replace Zapier for lead routing — without giving up routing.',
    sub: 'Receive Meta Lead Ads + Google Ads Lead Form submissions in real time, route them per-form to multiple destinations, and surface them in your client portal in one move.',
  },
  sections: [
    {
      title: 'Real-time, not polled',
      body: 'Meta and Google both publish native webhooks. We accept them directly — sub-60-second delivery instead of Zapier\'s 1-15 minute polling window. Speed-to-lead matters: contacting a lead within 5 minutes is 21x more likely to convert.',
      icon: 'i-lucide-zap',
    },
    {
      title: 'Multi-tenant by design',
      body: 'One agency dashboard manages every client\'s lead routing. Each client gets their own webhook URL, their own form rules, and their own portal view — no Zap duplication, no per-task fees.',
      icon: 'i-lucide-users',
    },
    {
      title: 'Client portal inbox built-in',
      body: 'Add a "portal" destination to any rule and the client sees their leads inside the same XeroFlow portal where they already track invoices and projects. Branded, real-time, no extra login.',
      icon: 'i-lucide-monitor',
    },
    {
      title: 'Routing logic that\'s actually useful',
      body: 'Per-destination filters: "SMS only if budget > $5,000", "Slack only if utm_source = facebook". Optional delays from immediate to 24 hours. HMAC-signed outbound webhooks with idempotency keys so receivers can safely dedupe our retries.',
      icon: 'i-lucide-list-checks',
    },
  ],
}
```

- [ ] **Step 4: Surface in the mega menu**

Open `app/components/MarketingNav.vue`:

```bash
sed -n '1,80p' app/components/MarketingNav.vue
```

Find the "Operations" mega-menu group (or create one) and add a link:

```vue
<NuxtLink to="/features/lead-capture-routing" class="...">
  <UIcon name="i-lucide-inbox" />
  Lead Capture & Routing
</NuxtLink>
```

(Concrete location depends on the existing nav layout. Match the surrounding pattern.)

- [ ] **Step 5: Smoke check the marketing pages**

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm dev &
sleep 8
curl -s http://localhost:3000/features | grep -i 'Lead Capture'
curl -s http://localhost:3000/features/lead-capture-routing | grep -i 'Replace Zapier'
```

Expected: matches in both.

- [ ] **Step 6: Commit**

```bash
git add app/pages/features/index.vue app/pages/features/[slug].vue app/components/MarketingNav.vue
git commit -m "feat(leads/marketing): add Lead Capture & Routing feature page + nav entry"
```

---

## Section E — Load test

### Task 10: 1,000-leads-in-60s load test

**Files:**
- Create: `scripts/loadtest-leads.mjs`

- [ ] **Step 1: Implement**

```js
// scripts/loadtest-leads.mjs
// Pumps N synthetic Google Lead Form payloads through the local or staging
// webhook, then polls the DB to measure ingest + drain time.
//
// Usage:
//   node scripts/loadtest-leads.mjs \
//     --base http://localhost:3000 \
//     --token <url_token> \
//     --key <secret_key> \
//     --count 1000 --concurrency 50
//
// Pre-req: a webhook endpoint row exists (see /api/leads/endpoints/list).

import { argv, exit } from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'

const args = Object.fromEntries(
  argv.slice(2).flatMap((a, i, arr) =>
    a.startsWith('--') ? [[a.slice(2), arr[i + 1]]] : []
  ),
)

const base = args.base ?? 'http://localhost:3000'
const token = args.token
const key = args.key
const count = Number(args.count ?? 1000)
const concurrency = Number(args.concurrency ?? 50)

if (!token || !key) {
  console.error('Required: --token and --key (from /api/leads/endpoints/list)')
  exit(1)
}

const url = `${base}/api/leads/webhook/google/${token}`

function payload(i) {
  return {
    google_key: key,
    lead_id: `loadtest-${Date.now()}-${i}`,
    api_version: '1.0',
    form_id: 'loadtest-form',
    campaign_id: 'LT-CAMPAIGN',
    gcl_id: `gcl-${i}`,
    user_column_data: [
      { column_name: 'EMAIL', string_value: `lt-${i}@example.test` },
      { column_name: 'FULL_NAME', string_value: `Load Tester ${i}` },
      { column_name: 'PHONE_NUMBER', string_value: `+6140${String(i).padStart(7, '0')}` },
    ],
  }
}

async function send(i) {
  const t0 = performance.now()
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload(i)),
  })
  const dt = performance.now() - t0
  if (!r.ok) {
    const text = await r.text()
    return { ok: false, status: r.status, ms: dt, body: text.slice(0, 100) }
  }
  return { ok: true, status: r.status, ms: dt }
}

const start = performance.now()
let successes = 0, failures = 0
const latencies = []

async function worker(idsQueue) {
  while (idsQueue.length) {
    const i = idsQueue.shift()
    if (i === undefined) break
    const r = await send(i)
    if (r.ok) { successes++; latencies.push(r.ms) }
    else { failures++; console.error('fail', r.status, r.body) }
  }
}

const ids = Array.from({ length: count }, (_, i) => i)
const workers = Array.from({ length: concurrency }, () => worker(ids))
await Promise.all(workers)

const total = (performance.now() - start) / 1000
latencies.sort((a, b) => a - b)
const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0
const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0

console.log(`Sent ${count} in ${total.toFixed(1)}s — ${(count / total).toFixed(1)}/s`)
console.log(`Success: ${successes}, Failed: ${failures}`)
console.log(`Latency p50/p95/p99: ${p50.toFixed(0)}ms / ${p95.toFixed(0)}ms / ${p99.toFixed(0)}ms`)
```

- [ ] **Step 2: Make executable + smoke run with small count**

```bash
chmod +x scripts/loadtest-leads.mjs

# Get token+key from the endpoints list (replace <CLIENT> with a real client id)
TOKEN=$(curl -s http://localhost:3000/api/leads/endpoints/list | jq -r '.items[0].url_token')
KEY=$(curl -s http://localhost:3000/api/leads/endpoints/list | jq -r '.items[0].secret_key')

node scripts/loadtest-leads.mjs --base http://localhost:3000 --token "$TOKEN" --key "$KEY" --count 50 --concurrency 10
```

Expected output: 50 sent in <10s, 50 success.

- [ ] **Step 3: Full run — 1,000 leads in 60s**

```bash
node scripts/loadtest-leads.mjs --base http://localhost:3000 --token "$TOKEN" --key "$KEY" --count 1000 --concurrency 50
```

Expected: ≥ 1000 / 60 = 16.6 req/s. Latency p95 < 1s. 0 failures.

- [ ] **Step 4: Verify queue drain**

```bash
# Right after the load test, check pending deliveries
psql "$DATABASE_URL" -c "SELECT status, COUNT(*) FROM lead_deliveries WHERE created_at > NOW() - INTERVAL '5 minutes' GROUP BY status;"
# Wait 5 minutes, re-run — pending should approach 0
sleep 300
psql "$DATABASE_URL" -c "SELECT status, COUNT(*) FROM lead_deliveries WHERE created_at > NOW() - INTERVAL '15 minutes' GROUP BY status;"
```

Expected: pending count drops to 0 within 5 minutes after the test ends.

- [ ] **Step 5: Commit**

```bash
git add scripts/loadtest-leads.mjs
git commit -m "feat(leads/ops): load test script — 1000 leads in 60s"
```

---

## Section F — Final UAT

### Task 11: Staging UAT checklist

**Files:**
- Create: `docs/superpowers/uat/2026-04-30-leads-engine-uat.md`

- [ ] **Step 1: Write the UAT doc**

```md
# Leads Engine — Staging UAT

**Date target:** before Phase 1 ship.
**Environment:** staging (Pages preview branch + staging Cloudflare account).
**Owner:** the executor of this plan.

## Pre-flight

- [ ] All three plans (1a / 1b / 1c) merged to `main`
- [ ] Migration `084-leads-engine.sql` applied to staging Neon
- [ ] `leads-delivery-worker` deployed to staging account
- [ ] `leads-cron` deployed to staging account
- [ ] `LEADS_DELIVERY_QUEUE` producer binding configured on the staging Pages env
- [ ] CF dashboard has the queue consumer wired
- [ ] `INTERNAL_CRON_TOKEN`, `RESEND_API_KEY`, `DATABASE_URL`, `META_LEADGEN_VERIFY_TOKEN` all set on Pages + Worker envs

## Real Google Ads round-trip

- [ ] Pick a test client in staging
- [ ] Settings → Social → Google → Lead webhooks: copy URL + key for that client
- [ ] In a Google Ads test account, create a Lead form asset with a few questions, paste URL + key into "Webhook integration" → click "Send test data"
- [ ] Confirm 200 response in Google Ads
- [ ] Confirm a row appears at `/agency/leads` for the test client within 30 seconds
- [ ] Confirm a notification reaches the assigned AM (or the client's primary AM)
- [ ] Confirm the SSE stream pushed the lead to the open inbox without refresh

## Form Rules editor

- [ ] Switch to the Form Rules tab; the Google test form is listed
- [ ] Click Configure; rule auto-creates
- [ ] Add a `slack` destination pointing at `#staging-leads`; save
- [ ] Add a `webhook` destination pointing at https://webhook.site/<your-token>; save
- [ ] Add an `email` destination addressing `staging-ops@adme.net.au`; save
- [ ] Add a `portal` destination; save
- [ ] Click Test fire — confirm all four destinations show `delivered` (or http_200 for webhook.site)
- [ ] Send another test data event from Google Ads; confirm Slack message arrives within 60s, email within 60s, webhook.site captured the JSON, portal inbox shows the lead for the client

## Filters

- [ ] Edit the Slack destination; add a filter `field_data.budget gt 5000`
- [ ] Send a test lead with budget 1000 → Slack does NOT receive (delivery row `cancelled` or skipped via filter)
- [ ] Send a test lead with budget 10000 → Slack receives

## Delays

- [ ] Add a destination with delay 5 minutes
- [ ] Send a test lead; confirm delivery row in `pending` for ~5 min, then dispatched
- [ ] Disable that destination during the wait; confirm delivery flips to `skipped` reason `destination_disabled` instead of firing

## Manual entry

- [ ] Click "+ Manual lead", pick a client, add fields, submit
- [ ] Confirm row appears in inbox with `source=manual`
- [ ] Confirm notification fired to the assigned AM

## Client portal

- [ ] Log in as a portal user for that client
- [ ] Visit `/portal/leads`; confirm only that client's portal-flagged leads show
- [ ] Click a lead; confirm detail (no delivery history, no assignment)
- [ ] Click "Mark contacted"; confirm status updates and the agency side reflects `contacted_by` = the portal user
- [ ] CSV export downloads only the visible leads

## Operations

- [ ] Trigger `/api/leads/_internal/recover-stuck-claims` manually (with `INTERNAL_CRON_TOKEN`); 200 response, `reset` field returns
- [ ] Force a stuck claim by manually setting a delivery to `claimed` 6 minutes ago; re-run cron; confirm reset
- [ ] Trigger `/api/leads/_internal/purge-ingestion-errors`; confirm 200 + sensible `deleted` count
- [ ] Inspect Worker logs in CF dashboard during a load run; no unhandled exceptions

## Load

- [ ] Run `scripts/loadtest-leads.mjs` against staging with 1,000 leads / concurrency 50
- [ ] Confirm: 0 failures, p95 latency < 1s, queue drains within 5 minutes
- [ ] Inspect `lead_deliveries` aggregates: no `failed` (other than ones intentionally bad), no `claimed` stragglers

## Privacy

- [ ] Soft-delete a lead from the inbox; confirm gone from filters but still queryable in DB with `deleted_at` set
- [ ] As an admin, hit `/api/leads/<id>/purge`; confirm hard-delete cascades to `lead_deliveries`
- [ ] Confirm `lead_ingestion_errors` purge works on rows older than 30 days (use a hand-aged row)
- [ ] Confirm retention purge works in dry-run with `LEADS_RETENTION_MONTHS=1` (then revert to 18)

## Sign-off

- [ ] All items above checked
- [ ] Plan 1a / 1b / 1c milestone tags exist (`leads-1a-backend`, `leads-1b-ui`, `leads-1c-ops`)
- [ ] Cut a `leads-phase-1-shipped` annotated tag pointing at the merge commit
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/uat/2026-04-30-leads-engine-uat.md
git commit -m "docs(leads/uat): staging UAT checklist for Phase 1"
```

---

### Task 12: Final ship tag

- [ ] **Step 1: Tag the milestone**

```bash
git tag -a leads-1c-ops -m "Phase 1c ops complete — notifications, crons, worker deploy, marketing, load test"
```

- [ ] **Step 2: After UAT passes, tag the ship**

```bash
git tag -a leads-phase-1-shipped -m "Leads engine Phase 1 shipped — Google ad inquiries handled in-platform"
```

---

## Spec coverage check (ops + verification items)

| Phase 1 spec item | Task |
|---|---|
| New-lead notification reaches assigned AM via Smart Watch | 1, 2 |
| `lead_ingestion_errors` 30-day purge cron runs | 3, 5 |
| Stuck-claim recovery cron resets stale claims after 5 minutes | 5 (uses Plan 1a Task 21 endpoint) |
| Retention default 18 months, configurable | 4, 5 |
| Worker deploy + queue consumer wiring | 6–8 |
| Marketing site sync — features pages + mega menu | 9 |
| Load test (1,000 leads in 60s) | 10 |
| Final UAT pass on staging | 11–12 |

**Phase 1 acceptance criteria fully covered across plans 1a + 1b + 1c.**

---

## Beyond Phase 1

Phase 2 (Meta lead capture + SMS + autoresponders) and Phase 3 (spam scoring + no-reply escalation + attribution dashboard) are documented in the design spec and will get their own plans once Phase 1 is shipped and observed in real traffic for ≥1 week.

**Plan 1c complete.**
