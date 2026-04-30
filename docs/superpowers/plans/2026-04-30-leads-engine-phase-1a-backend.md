# Leads Engine — Phase 1a (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the leads-engine backend end-to-end: schema, normalizer, rules engine, queue + delivery worker, six destination adapters, ingestion endpoints (Google webhook + manual entry), and the full agency + client-portal API surface — all callable via curl/Postman before any UI work.

**Architecture:** Nitro endpoints write canonical leads into Postgres with `UNIQUE(source, source_lead_id)` idempotency, enqueue rule evaluation onto CF Queues, the consumer (companion `leads-delivery-worker`) claim-locks each delivery, re-validates lead/rule/destination at fire time, dispatches via a pluggable adapter registry, and persists outcomes to `lead_deliveries` for audit + retry. Pure-logic units (filter eval, template render, rate-limit ring, idempotency keys, scoring stub) are TDD-driven; endpoints get integration tests for happy + error paths.

**Tech Stack:** Nuxt 4 / Nitro, Neon Postgres (`pg` via Hyperdrive in prod, `neon()` HTTP in dev), Cloudflare Queues, Cloudflare Workers (companion), Resend, Vitest + node env, Zod for validation.

**Spec:** `docs/superpowers/specs/2026-04-30-leads-engine-design.md`

**Out of scope for this plan:** Agency UI, portal UI, settings tab, Smart Watch notification wiring, marketing site sync, load test. Those land in plans `1b` and `1c`.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `server/database/migrations/084-leads-engine.sql` | create | Phase 1 tables + `lead_arrived` reason note |
| `app/types/index.ts` | modify | Add `Lead`, `LeadDelivery`, `LeadFormRule`, `LeadRuleDestination`, `LeadFilter`, `DispatchResult` types |
| `server/utils/leads/db.ts` | create | DB primitives — `insertLeadWithDedup`, `loadLead`, `loadRuleForForm`, `claimDelivery`, etc. |
| `server/utils/leads/filterEval.ts` | create | Pure filter evaluator (12 operators) |
| `server/utils/leads/templateRender.ts` | create | Pure template renderer with `{{ field.x }}` syntax |
| `server/utils/leads/idempotency.ts` | create | Stable key generator |
| `server/utils/leads/rateLimit.ts` | create | In-memory ring buffer |
| `server/utils/leads/normalizer.ts` | create | Google + manual payload → canonical Lead |
| `server/utils/leads/autoAssign.ts` | create | Resolve `assigned_to` from `client_team_assignments` |
| `server/utils/leads/rulesEngine.ts` | create | `evaluateLead(leadId)` → DeliveryRow[] |
| `server/utils/leads/queue.ts` | create | CF Queue producer with graceful inline fallback |
| `server/utils/leads/destinations/types.ts` | create | `DestinationAdapter` interface + `DispatchResult` |
| `server/utils/leads/destinations/index.ts` | create | Adapter registry |
| `server/utils/leads/destinations/portal.ts` | create | Portal-write adapter |
| `server/utils/leads/destinations/webhook.ts` | create | Outbound webhook (HMAC + idempotency-key + SSRF defense) |
| `server/utils/leads/destinations/slack.ts` | create | Slack incoming webhook (Block Kit) |
| `server/utils/leads/destinations/email.ts` | create | Resend adapter |
| `server/utils/leads/destinations/sheets.ts` | create | Google Sheets append (scope check + friendly error) |
| `server/utils/leads/destinations/assignUser.ts` | create | Sets `leads.assigned_to` |
| `server/utils/leads/dispatch.ts` | create | Inner dispatch loop (used by Worker AND fallback) |
| `workers/leads-delivery-worker/src/index.ts` | create | CF Queue consumer entry — claim, re-validate, dispatch, retry |
| `workers/leads-delivery-worker/wrangler.toml` | create | Worker config (queue binding, hyperdrive, env) |
| `workers/leads-delivery-worker/package.json` | create | Worker deps |
| `server/api/leads/webhook/google/[token].get.ts` | create | Health probe for the per-client URL |
| `server/api/leads/webhook/google/[token].post.ts` | create | Google Lead Form ingestion |
| `server/api/leads/index.post.ts` | create | Manual lead entry |
| `server/api/leads/list.get.ts` | create | Filtered + paginated agency lead list |
| `server/api/leads/[id].get.ts` | create | Lead detail incl. delivery history |
| `server/api/leads/[id].patch.ts` | create | Status / assignment / notes update |
| `server/api/leads/[id].delete.ts` | create | Soft delete |
| `server/api/leads/[id]/purge.delete.ts` | create | Admin hard delete (cascades) |
| `server/api/leads/[id]/retry.post.ts` | create | Reset failed deliveries back to pending |
| `server/api/leads/export.get.ts` | create | CSV export honoring filters |
| `server/api/leads/stream.get.ts` | create | SSE feed of new leads |
| `server/api/leads/rules/list.get.ts` | create | List `(client × form)` combos with rule status |
| `server/api/leads/rules/[ruleId].get.ts` | create | Rule + destinations |
| `server/api/leads/rules/[ruleId].patch.ts` | create | Toggle enabled / rename |
| `server/api/leads/rules/[ruleId]/destinations.post.ts` | create | Add destination |
| `server/api/leads/rules/[ruleId]/destinations/[destId].put.ts` | create | Update destination |
| `server/api/leads/rules/[ruleId]/destinations/[destId].delete.ts` | create | Remove destination |
| `server/api/leads/rules/[ruleId]/test-fire.post.ts` | create | Synthesize lead → run rule → return per-dest result, no persist |
| `server/api/leads/endpoints/list.get.ts` | create | Per-client webhook URL+key list |
| `server/api/leads/endpoints/[id]/rotate.post.ts` | create | Rotate key with 30-min grace |
| `server/api/leads/forms/list.get.ts` | create | Form metadata for filter builder |
| `server/api/leads/dev/replay/[errorId].post.ts` | create | Dev-only replay of stored ingestion errors |
| `server/api/client-portal/leads/list.get.ts` | create | Client's own leads |
| `server/api/client-portal/leads/[id].get.ts` | create | Client lead detail (no delivery history) |
| `server/api/client-portal/leads/[id]/contacted.post.ts` | create | Client marks contacted |
| `server/api/client-portal/leads/export.get.ts` | create | Client CSV export |
| `test/server/utils/leads/filterEval.test.ts` | create | TDD subject |
| `test/server/utils/leads/templateRender.test.ts` | create | TDD subject |
| `test/server/utils/leads/idempotency.test.ts` | create | TDD subject |
| `test/server/utils/leads/rateLimit.test.ts` | create | TDD subject |
| `test/server/utils/leads/normalizer.test.ts` | create | Google + manual normalization |
| `test/server/utils/leads/rulesEngine.test.ts` | create | Engine fan-out + filter integration |
| `test/server/utils/leads/destinations/webhook.test.ts` | create | SSRF defense + signing + idempotency header |
| `test/server/utils/leads/destinations/email.test.ts` | create | Resend adapter (mocked) |
| `test/server/api/leads/webhook-google.test.ts` | create | End-to-end ingestion integration test |

---

## Section A — Foundation: schema, types, db primitives

### Task 1: Migration `084-leads-engine.sql`

**Files:**
- Create: `server/database/migrations/084-leads-engine.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 084-leads-engine.sql
-- Phase 1 of the Leads Engine (Zapier replacement for Meta+Google ad inquiries).
-- See docs/superpowers/specs/2026-04-30-leads-engine-design.md.
--
-- Tables:
--   lead_webhook_endpoints  - per-client tokenized URL+key for Google
--   lead_form_metadata      - discovered form schema for filter builder
--   leads                   - canonical normalized lead
--   lead_form_rules         - one rule set per (source, form_id)
--   lead_rule_destinations  - per-rule fan-out targets
--   lead_deliveries         - audit log of every dispatch attempt
--   lead_ingestion_errors   - 30-day TTL bucket for ops review
--
-- Smart Watch reason: notifications.reason already accepts free text (077-),
-- so 'lead_arrived' is a value, not a schema change.

BEGIN;

-- ============================================
-- lead_webhook_endpoints
-- ============================================
CREATE TABLE IF NOT EXISTS lead_webhook_endpoints (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  source                  VARCHAR(20) NOT NULL DEFAULT 'google',
  url_token               TEXT NOT NULL UNIQUE,
  secret_key              TEXT NOT NULL,
  secret_key_previous     TEXT,
  secret_key_grace_until  TIMESTAMPTZ,
  rotated_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source IN ('google','meta_app'))
);
CREATE INDEX IF NOT EXISTS idx_lead_webhook_endpoints_client
  ON lead_webhook_endpoints(client_id);

-- ============================================
-- lead_form_metadata
-- ============================================
CREATE TABLE IF NOT EXISTS lead_form_metadata (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        VARCHAR(20) NOT NULL,
  form_id       TEXT NOT NULL,
  form_name     TEXT,
  fields        JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_lead_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source, form_id)
);

-- ============================================
-- leads
-- ============================================
CREATE TABLE IF NOT EXISTS leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  source          VARCHAR(20) NOT NULL,
  source_lead_id  TEXT NOT NULL,
  form_id         TEXT,
  form_name       TEXT,
  ad_id           TEXT,
  ad_name         TEXT,
  campaign_id     TEXT,
  campaign_name   TEXT,
  page_id         TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  field_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
  attribution     JSONB,
  score           INT,
  score_reasons   JSONB,
  status          VARCHAR(20) NOT NULL DEFAULT 'new',
  spam_reasons    JSONB,
  assigned_to     UUID REFERENCES team_members(id) ON DELETE SET NULL,
  contacted_at    TIMESTAMPTZ,
  contacted_by    UUID REFERENCES team_members(id) ON DELETE SET NULL,
  notes           TEXT,
  created_by      UUID REFERENCES team_members(id) ON DELETE SET NULL,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source IN ('meta','google','manual')),
  CHECK (status IN ('new','contacted','qualified','won','lost','spam_suspected'))
);

-- Idempotency: one live row per (source, source_lead_id). Soft-deleted rows excluded.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_source_id_live
  ON leads(source, source_lead_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_client_status_submitted
  ON leads(client_id, status, submitted_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_form_submitted
  ON leads(form_id, submitted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_new
  ON leads(submitted_at DESC) WHERE status='new' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_unmapped
  ON leads(submitted_at DESC) WHERE client_id IS NULL AND deleted_at IS NULL;

-- ============================================
-- lead_form_rules
-- ============================================
CREATE TABLE IF NOT EXISTS lead_form_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  source      VARCHAR(20) NOT NULL,
  form_id     TEXT NOT NULL,
  form_name   TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source, form_id),
  CHECK (source IN ('meta','google'))
);

-- ============================================
-- lead_rule_destinations
-- ============================================
CREATE TABLE IF NOT EXISTS lead_rule_destinations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           UUID NOT NULL REFERENCES lead_form_rules(id) ON DELETE CASCADE,
  destination_type  VARCHAR(30) NOT NULL,
  config            JSONB NOT NULL,
  filter            JSONB,
  delay_minutes     INT NOT NULL DEFAULT 0,
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (destination_type IN (
    'portal','webhook','slack','email','sheets','assign_user',
    'sms','autoresponder_email','autoresponder_sms'
  )),
  CHECK (delay_minutes >= 0 AND delay_minutes <= 1440)
);
CREATE INDEX IF NOT EXISTS idx_lrd_rule
  ON lead_rule_destinations(rule_id, sort_order);

-- ============================================
-- lead_deliveries
-- ============================================
CREATE TABLE IF NOT EXISTS lead_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id             UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  rule_destination_id UUID REFERENCES lead_rule_destinations(id) ON DELETE SET NULL,
  destination_type    VARCHAR(30) NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending',
  scheduled_at        TIMESTAMPTZ NOT NULL,
  claimed_at          TIMESTAMPTZ,
  claimed_by          TEXT,
  attempted_at        TIMESTAMPTZ,
  last_error          TEXT,
  retry_count         INT NOT NULL DEFAULT 0,
  response_meta       JSONB,
  idempotency_key     TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('pending','claimed','delivered','failed','cancelled','skipped'))
);
CREATE INDEX IF NOT EXISTS idx_ld_lead ON lead_deliveries(lead_id);
CREATE INDEX IF NOT EXISTS idx_ld_pending
  ON lead_deliveries(scheduled_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_ld_claimed
  ON lead_deliveries(claimed_at) WHERE status='claimed';

-- ============================================
-- lead_ingestion_errors  (30-day TTL via cron)
-- ============================================
CREATE TABLE IF NOT EXISTS lead_ingestion_errors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       VARCHAR(20) NOT NULL,
  raw_payload  JSONB,
  headers      JSONB,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lie_created ON lead_ingestion_errors(created_at);

-- updated_at trigger for tables that need it
DO $$ BEGIN
  CREATE TRIGGER update_lead_form_metadata_updated_at
    BEFORE UPDATE ON lead_form_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_lead_form_rules_updated_at
    BEFORE UPDATE ON lead_form_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_lead_rule_destinations_updated_at
    BEFORE UPDATE ON lead_rule_destinations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_lead_deliveries_updated_at
    BEFORE UPDATE ON lead_deliveries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
```

- [ ] **Step 2: Run the migration**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/084-leads-engine.sql
```

Expected: `BEGIN ... COMMIT` with no errors.

- [ ] **Step 3: Verify tables exist**

```bash
psql "$DATABASE_URL" -c "\dt lead*"
```

Expected: 6 rows for `lead_deliveries`, `lead_form_metadata`, `lead_form_rules`, `lead_ingestion_errors`, `lead_rule_destinations`, `lead_webhook_endpoints`.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/084-leads-engine.sql
git commit -m "feat(leads): migration 084 — leads engine schema"
```

---

### Task 2: TypeScript types

**Files:**
- Modify: `app/types/index.ts`

- [ ] **Step 1: Append leads types to `app/types/index.ts`**

Open the file, scroll to the end, and add:

```ts
// ============================================================================
// Leads engine — see docs/superpowers/specs/2026-04-30-leads-engine-design.md
// ============================================================================

export type LeadSource = 'meta' | 'google' | 'manual'
export type LeadStatus =
  | 'new' | 'contacted' | 'qualified' | 'won' | 'lost' | 'spam_suspected'
export type LeadDeliveryStatus =
  | 'pending' | 'claimed' | 'delivered' | 'failed' | 'cancelled' | 'skipped'
export type LeadDestinationType =
  | 'portal' | 'webhook' | 'slack' | 'email' | 'sheets' | 'assign_user'
  | 'sms' | 'autoresponder_email' | 'autoresponder_sms'

export interface Lead {
  id: string
  client_id: string | null
  source: LeadSource
  source_lead_id: string
  form_id: string | null
  form_name: string | null
  ad_id: string | null
  ad_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  page_id: string | null
  submitted_at: string
  ingested_at: string
  field_data: Record<string, string>
  attribution: Record<string, string> | null
  score: number | null
  score_reasons: any | null
  status: LeadStatus
  spam_reasons: any | null
  assigned_to: string | null
  contacted_at: string | null
  contacted_by: string | null
  notes: string | null
  created_by: string | null
  deleted_at: string | null
  created_at: string
}

export type LeadFilterOp =
  | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte'
  | 'contains' | 'starts_with' | 'ends_with'
  | 'is_empty' | 'is_not_empty' | 'in' | 'not_in'

export interface LeadFilter {
  field: string                // dotted path: 'field_data.budget' | 'attribution.utm_source' | 'score'
  op: LeadFilterOp
  value?: string | number | boolean | string[] | null
}

export interface LeadFormRule {
  id: string
  client_id: string
  source: 'meta' | 'google'
  form_id: string
  form_name: string | null
  enabled: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LeadRuleDestination {
  id: string
  rule_id: string
  destination_type: LeadDestinationType
  config: Record<string, any>
  filter: LeadFilter | null
  delay_minutes: number
  enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface LeadDelivery {
  id: string
  lead_id: string
  rule_destination_id: string | null
  destination_type: LeadDestinationType
  status: LeadDeliveryStatus
  scheduled_at: string
  claimed_at: string | null
  claimed_by: string | null
  attempted_at: string | null
  last_error: string | null
  retry_count: number
  response_meta: any | null
  idempotency_key: string
  created_at: string
  updated_at: string
}

export interface LeadFormMetadataField {
  key: string
  label?: string
  sample_value?: string
  first_seen_at: string
}

export interface LeadFormMetadata {
  id: string
  source: LeadSource
  form_id: string
  form_name: string | null
  fields: LeadFormMetadataField[]
  last_lead_at: string | null
  created_at: string
  updated_at: string
}

export interface LeadWebhookEndpoint {
  id: string
  client_id: string
  source: 'google' | 'meta_app'
  url_token: string
  secret_key: string
  secret_key_previous: string | null
  secret_key_grace_until: string | null
  rotated_at: string | null
  created_at: string
}

export type DispatchResult =
  | { status: 'delivered'; response_meta?: any }
  | { status: 'failed'; error: string; retry_after_ms?: number }
```

- [ ] **Step 2: Verify TypeScript still compiles**

```bash
pnpm typecheck 2>&1 | head -30
```

Expected: no NEW errors mentioning leads types (pre-existing ~60 errors per CLAUDE.md are tolerated).

- [ ] **Step 3: Commit**

```bash
git add app/types/index.ts
git commit -m "feat(leads): TypeScript types for leads engine"
```

---

### Task 3: DB primitives — `server/utils/leads/db.ts`

**Files:**
- Create: `server/utils/leads/db.ts`

- [ ] **Step 1: Create the file**

```ts
// server/utils/leads/db.ts
// Thin DB primitives for the leads engine. Wraps queryRows/queryOne/execute
// from ~~/server/utils/db. Keeps SQL out of route handlers.

import { queryRows, queryOne, execute } from '~~/server/utils/db'
import type {
  Lead, LeadDelivery, LeadFormRule, LeadRuleDestination,
  LeadFormMetadata, LeadFormMetadataField, LeadSource,
} from '~~/app/types'

// ----------------------------------------------------------------------------
// Leads
// ----------------------------------------------------------------------------

export interface InsertLeadInput {
  client_id: string | null
  source: LeadSource
  source_lead_id: string
  form_id: string | null
  form_name: string | null
  ad_id: string | null
  ad_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  page_id: string | null
  submitted_at: string
  field_data: Record<string, string>
  attribution: Record<string, string> | null
  assigned_to: string | null
  created_by: string | null
}

/** INSERT … ON CONFLICT DO NOTHING RETURNING id. Returns null if duplicate. */
export async function insertLeadWithDedup(input: InsertLeadInput): Promise<string | null> {
  const row = await queryOne<{ id: string }>(`
    INSERT INTO leads (
      client_id, source, source_lead_id, form_id, form_name,
      ad_id, ad_name, campaign_id, campaign_name, page_id,
      submitted_at, field_data, attribution, assigned_to, created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15
    )
    ON CONFLICT (source, source_lead_id) WHERE deleted_at IS NULL
    DO NOTHING
    RETURNING id
  `, [
    input.client_id, input.source, input.source_lead_id, input.form_id, input.form_name,
    input.ad_id, input.ad_name, input.campaign_id, input.campaign_name, input.page_id,
    input.submitted_at,
    JSON.stringify(input.field_data),
    input.attribution ? JSON.stringify(input.attribution) : null,
    input.assigned_to, input.created_by,
  ])
  return row?.id ?? null
}

export async function loadLead(id: string): Promise<Lead | null> {
  return queryOne<Lead>(`SELECT * FROM leads WHERE id = $1 AND deleted_at IS NULL`, [id])
}

export async function softDeleteLead(id: string): Promise<number> {
  return execute(`UPDATE leads SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id])
}

export async function purgeLead(id: string): Promise<number> {
  // ON DELETE CASCADE handles lead_deliveries
  return execute(`DELETE FROM leads WHERE id = $1`, [id])
}

// ----------------------------------------------------------------------------
// Form metadata
// ----------------------------------------------------------------------------

/**
 * Upsert form metadata, unioning newly-observed field keys.
 * Stable for concurrent ingestions (uses jsonb_object_agg pattern).
 */
export async function upsertFormMetadata(
  source: LeadSource,
  form_id: string,
  form_name: string | null,
  fieldData: Record<string, string>,
): Promise<void> {
  const newFields: LeadFormMetadataField[] = Object.entries(fieldData).map(([key, value]) => ({
    key,
    sample_value: typeof value === 'string' ? value.slice(0, 200) : String(value),
    first_seen_at: new Date().toISOString(),
  }))

  // Pull current fields, union by key, write back. Single round trip via CTE.
  await execute(`
    INSERT INTO lead_form_metadata (source, form_id, form_name, fields, last_lead_at)
    VALUES ($1, $2, $3, $4::jsonb, NOW())
    ON CONFLICT (source, form_id) DO UPDATE SET
      form_name = COALESCE(EXCLUDED.form_name, lead_form_metadata.form_name),
      last_lead_at = EXCLUDED.last_lead_at,
      fields = (
        SELECT jsonb_agg(DISTINCT f) FROM (
          SELECT jsonb_array_elements(lead_form_metadata.fields) AS f
          UNION
          SELECT jsonb_array_elements(EXCLUDED.fields) AS f
        ) merged
      ),
      updated_at = NOW()
  `, [source, form_id, form_name, JSON.stringify(newFields)])
}

export async function listFormMetadata(): Promise<LeadFormMetadata[]> {
  return queryRows<LeadFormMetadata>(
    `SELECT * FROM lead_form_metadata ORDER BY last_lead_at DESC NULLS LAST`,
  )
}

export async function loadFormMetadata(
  source: LeadSource,
  form_id: string,
): Promise<LeadFormMetadata | null> {
  return queryOne<LeadFormMetadata>(
    `SELECT * FROM lead_form_metadata WHERE source = $1 AND form_id = $2`,
    [source, form_id],
  )
}

// ----------------------------------------------------------------------------
// Rules + destinations
// ----------------------------------------------------------------------------

export async function loadRuleForForm(
  source: 'meta' | 'google',
  form_id: string,
): Promise<{ rule: LeadFormRule; destinations: LeadRuleDestination[] } | null> {
  const rule = await queryOne<LeadFormRule>(
    `SELECT * FROM lead_form_rules WHERE source = $1 AND form_id = $2`,
    [source, form_id],
  )
  if (!rule) return null
  const destinations = await queryRows<LeadRuleDestination>(
    `SELECT * FROM lead_rule_destinations
     WHERE rule_id = $1 AND enabled = TRUE
     ORDER BY sort_order ASC, created_at ASC`,
    [rule.id],
  )
  return { rule, destinations }
}

// ----------------------------------------------------------------------------
// Deliveries
// ----------------------------------------------------------------------------

export interface InsertDeliveryInput {
  lead_id: string
  rule_destination_id: string
  destination_type: string
  scheduled_at: string
  idempotency_key: string
}

export async function insertDelivery(input: InsertDeliveryInput): Promise<string> {
  const row = await queryOne<{ id: string }>(`
    INSERT INTO lead_deliveries (
      lead_id, rule_destination_id, destination_type,
      scheduled_at, idempotency_key, status
    )
    VALUES ($1, $2, $3, $4, $5, 'pending')
    RETURNING id
  `, [
    input.lead_id, input.rule_destination_id, input.destination_type,
    input.scheduled_at, input.idempotency_key,
  ])
  return row!.id
}

export async function insertCancelledPlaceholder(
  lead_id: string,
  reason: string,
): Promise<void> {
  await execute(`
    INSERT INTO lead_deliveries (
      lead_id, destination_type, status, scheduled_at,
      idempotency_key, last_error
    )
    VALUES ($1, '_placeholder', 'cancelled', NOW(), $2, $3)
  `, [lead_id, `cancel:${lead_id}`, reason])
}

/**
 * Atomic claim: marks pending → claimed if no one else got it first.
 * Returns the full delivery row when claimed, null otherwise.
 */
export async function claimDelivery(
  delivery_id: string,
  worker_id: string,
): Promise<LeadDelivery | null> {
  return queryOne<LeadDelivery>(`
    UPDATE lead_deliveries
    SET status = 'claimed', claimed_at = NOW(), claimed_by = $2, updated_at = NOW()
    WHERE id = $1 AND status = 'pending'
    RETURNING *
  `, [delivery_id, worker_id])
}

export async function releaseClaim(delivery_id: string): Promise<void> {
  await execute(`
    UPDATE lead_deliveries
    SET status = 'pending', claimed_at = NULL, claimed_by = NULL, updated_at = NOW()
    WHERE id = $1 AND status = 'claimed'
  `, [delivery_id])
}

export async function markDelivered(
  delivery_id: string,
  response_meta: any,
): Promise<void> {
  await execute(`
    UPDATE lead_deliveries
    SET status = 'delivered', attempted_at = NOW(), response_meta = $2::jsonb, updated_at = NOW()
    WHERE id = $1
  `, [delivery_id, JSON.stringify(response_meta ?? null)])
}

export async function markFailed(
  delivery_id: string,
  error: string,
  retry_count: number,
  finalized: boolean,
): Promise<void> {
  await execute(`
    UPDATE lead_deliveries
    SET status = $4, attempted_at = NOW(), last_error = $2,
        retry_count = $3, claimed_at = NULL, claimed_by = NULL, updated_at = NOW()
    WHERE id = $1
  `, [delivery_id, error, retry_count, finalized ? 'failed' : 'pending'])
}

export async function markSkipped(delivery_id: string, reason: string): Promise<void> {
  await execute(`
    UPDATE lead_deliveries
    SET status = 'skipped', last_error = $2, attempted_at = NOW(),
        claimed_at = NULL, claimed_by = NULL, updated_at = NOW()
    WHERE id = $1
  `, [delivery_id, reason])
}

export async function recoverStuckClaims(staleMinutes = 5): Promise<number> {
  return execute(`
    UPDATE lead_deliveries
    SET status = 'pending', claimed_at = NULL, claimed_by = NULL, updated_at = NOW()
    WHERE status = 'claimed' AND claimed_at < NOW() - ($1 || ' minutes')::interval
  `, [String(staleMinutes)])
}

// ----------------------------------------------------------------------------
// Ingestion error log
// ----------------------------------------------------------------------------

export async function logIngestionError(
  source: LeadSource,
  raw_payload: any,
  headers: any,
  error: string,
): Promise<void> {
  await execute(`
    INSERT INTO lead_ingestion_errors (source, raw_payload, headers, error)
    VALUES ($1, $2::jsonb, $3::jsonb, $4)
  `, [source, JSON.stringify(raw_payload ?? null), JSON.stringify(headers ?? null), error])
}
```

- [ ] **Step 2: Smoke test the file imports cleanly**

```bash
pnpm typecheck 2>&1 | grep "server/utils/leads/db.ts" | head -10
```

Expected: no errors, or only the same kind of pre-existing errors documented in CLAUDE.md.

- [ ] **Step 3: Commit**

```bash
git add server/utils/leads/db.ts
git commit -m "feat(leads): DB primitives for the leads engine"
```

---

## Section B — Pure-logic utilities (TDD)

### Task 4: Filter evaluator (TDD)

**Files:**
- Create: `test/server/utils/leads/filterEval.test.ts`
- Create: `server/utils/leads/filterEval.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/leads/filterEval.test.ts
import { describe, it, expect } from 'vitest'
import { evaluateFilter, resolveField } from '../../../../server/utils/leads/filterEval'
import type { Lead } from '../../../../app/types'

const baseLead: Lead = {
  id: 'L1', client_id: 'C1', source: 'google', source_lead_id: 's1',
  form_id: 'F1', form_name: 'Quote', ad_id: null, ad_name: null,
  campaign_id: null, campaign_name: null, page_id: null,
  submitted_at: '2026-04-30T10:00:00Z', ingested_at: '2026-04-30T10:00:01Z',
  field_data: { email: 'a@b.co', budget: '8000', country: 'AU' },
  attribution: { utm_source: 'fb', gclid: 'g1' },
  score: 72, score_reasons: null, status: 'new', spam_reasons: null,
  assigned_to: null, contacted_at: null, contacted_by: null, notes: null,
  created_by: null, deleted_at: null, created_at: '2026-04-30T10:00:01Z',
}

describe('resolveField', () => {
  it('reads top-level scalars', () => {
    expect(resolveField(baseLead, 'score')).toBe(72)
    expect(resolveField(baseLead, 'status')).toBe('new')
  })
  it('reads nested field_data and attribution', () => {
    expect(resolveField(baseLead, 'field_data.email')).toBe('a@b.co')
    expect(resolveField(baseLead, 'attribution.utm_source')).toBe('fb')
  })
  it('returns undefined for missing paths', () => {
    expect(resolveField(baseLead, 'field_data.missing')).toBeUndefined()
    expect(resolveField(baseLead, 'attribution.utm_medium')).toBeUndefined()
  })
})

describe('evaluateFilter', () => {
  it('null filter passes', () => {
    expect(evaluateFilter(baseLead, null)).toBe(true)
  })
  it('eq / neq', () => {
    expect(evaluateFilter(baseLead, { field: 'field_data.country', op: 'eq', value: 'AU' })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.country', op: 'neq', value: 'AU' })).toBe(false)
  })
  it('numeric gt/lt/gte/lte coerce strings', () => {
    expect(evaluateFilter(baseLead, { field: 'field_data.budget', op: 'gt', value: 5000 })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.budget', op: 'lte', value: 8000 })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.budget', op: 'lt', value: 5000 })).toBe(false)
  })
  it('contains / starts_with / ends_with', () => {
    expect(evaluateFilter(baseLead, { field: 'field_data.email', op: 'contains', value: '@b.' })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.email', op: 'starts_with', value: 'a@' })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.email', op: 'ends_with', value: '.co' })).toBe(true)
  })
  it('is_empty / is_not_empty', () => {
    expect(evaluateFilter(baseLead, { field: 'attribution.utm_medium', op: 'is_empty' })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.email', op: 'is_not_empty' })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'attribution.utm_source', op: 'is_empty' })).toBe(false)
  })
  it('in / not_in', () => {
    expect(evaluateFilter(baseLead, { field: 'field_data.country', op: 'in', value: ['AU', 'NZ'] })).toBe(true)
    expect(evaluateFilter(baseLead, { field: 'field_data.country', op: 'not_in', value: ['US', 'UK'] })).toBe(true)
  })
  it('returns false on missing field for non-empty ops', () => {
    expect(evaluateFilter(baseLead, { field: 'field_data.missing', op: 'eq', value: 'x' })).toBe(false)
    expect(evaluateFilter(baseLead, { field: 'field_data.missing', op: 'gt', value: 0 })).toBe(false)
  })
  it('unknown operator returns false (defensive)', () => {
    expect(evaluateFilter(baseLead, { field: 'score', op: 'bogus' as any, value: 0 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
pnpm vitest run test/server/utils/leads/filterEval.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `filterEval.ts`**

```ts
// server/utils/leads/filterEval.ts
// Pure filter evaluator for lead routing rules. No I/O, no imports from the
// app layer, no DB. Designed to be hot-pathable inside the rules engine.

import type { Lead, LeadFilter, LeadFilterOp } from '~~/app/types'

/** Read a dotted-path field from a lead. Returns undefined for missing paths. */
export function resolveField(lead: Lead, path: string): unknown {
  const parts = path.split('.')
  let cur: any = lead
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asString(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v
  return String(v)
}

const OPS: Record<LeadFilterOp, (left: unknown, right: unknown) => boolean> = {
  eq: (a, b) => asString(a) === asString(b),
  neq: (a, b) => asString(a) !== asString(b),
  gt: (a, b) => {
    const x = asNumber(a), y = asNumber(b)
    return x !== null && y !== null && x > y
  },
  lt: (a, b) => {
    const x = asNumber(a), y = asNumber(b)
    return x !== null && y !== null && x < y
  },
  gte: (a, b) => {
    const x = asNumber(a), y = asNumber(b)
    return x !== null && y !== null && x >= y
  },
  lte: (a, b) => {
    const x = asNumber(a), y = asNumber(b)
    return x !== null && y !== null && x <= y
  },
  contains: (a, b) => {
    const s = asString(a), n = asString(b)
    return s !== null && n !== null && s.toLowerCase().includes(n.toLowerCase())
  },
  starts_with: (a, b) => {
    const s = asString(a), n = asString(b)
    return s !== null && n !== null && s.toLowerCase().startsWith(n.toLowerCase())
  },
  ends_with: (a, b) => {
    const s = asString(a), n = asString(b)
    return s !== null && n !== null && s.toLowerCase().endsWith(n.toLowerCase())
  },
  is_empty: (a) => a === undefined || a === null || a === '',
  is_not_empty: (a) => a !== undefined && a !== null && a !== '',
  in: (a, b) => Array.isArray(b) && b.map(asString).includes(asString(a)),
  not_in: (a, b) => Array.isArray(b) && !b.map(asString).includes(asString(a)),
}

export function evaluateFilter(lead: Lead, filter: LeadFilter | null): boolean {
  if (!filter) return true
  const fn = OPS[filter.op]
  if (!fn) return false
  return fn(resolveField(lead, filter.field), filter.value)
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm vitest run test/server/utils/leads/filterEval.test.ts
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add server/utils/leads/filterEval.ts test/server/utils/leads/filterEval.test.ts
git commit -m "feat(leads): pure filter evaluator with full operator coverage"
```

---

### Task 5: Template renderer (TDD)

**Files:**
- Create: `test/server/utils/leads/templateRender.test.ts`
- Create: `server/utils/leads/templateRender.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/leads/templateRender.test.ts
import { describe, it, expect } from 'vitest'
import { renderTemplate } from '../../../../server/utils/leads/templateRender'
import type { Lead } from '../../../../app/types'

const lead: Lead = {
  id: 'L1', client_id: 'C1', source: 'google', source_lead_id: 's1',
  form_id: 'F1', form_name: 'Quote Form', ad_id: null, ad_name: null,
  campaign_id: null, campaign_name: null, page_id: null,
  submitted_at: '2026-04-30T10:00:00Z', ingested_at: '2026-04-30T10:00:01Z',
  field_data: { email: 'jane@acme.co', first_name: 'Jane', budget: '8000' },
  attribution: { utm_source: 'fb' },
  score: null, score_reasons: null, status: 'new', spam_reasons: null,
  assigned_to: null, contacted_at: null, contacted_by: null, notes: null,
  created_by: null, deleted_at: null, created_at: '2026-04-30T10:00:01Z',
}

describe('renderTemplate', () => {
  it('substitutes field paths', () => {
    const r = renderTemplate('Hi {{ field.first_name }}', lead)
    expect(r.text).toBe('Hi Jane')
    expect(r.warnings).toEqual([])
  })
  it('handles top-level lead paths', () => {
    expect(renderTemplate('From {{ source }}', lead).text).toBe('From google')
    expect(renderTemplate('Form: {{ form_name }}', lead).text).toBe('Form: Quote Form')
  })
  it('handles attribution paths', () => {
    expect(renderTemplate('Src {{ attribution.utm_source }}', lead).text).toBe('Src fb')
  })
  it('renders missing fields as empty + warns', () => {
    const r = renderTemplate('Hi {{ field.middle_name }}!', lead)
    expect(r.text).toBe('Hi !')
    expect(r.warnings).toContain('field.middle_name')
  })
  it('escapes HTML in scalar values when html=true', () => {
    const evil: Lead = { ...lead, field_data: { ...lead.field_data, first_name: '<b>x</b>' } }
    const r = renderTemplate('Hi {{ field.first_name }}', evil, { html: true })
    expect(r.text).toBe('Hi &lt;b&gt;x&lt;/b&gt;')
  })
  it('leaves unknown braces alone if not template syntax', () => {
    expect(renderTemplate('1{2}3', lead).text).toBe('1{2}3')
  })
})
```

- [ ] **Step 2: Run tests, confirm failure**

```bash
pnpm vitest run test/server/utils/leads/templateRender.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// server/utils/leads/templateRender.ts
// Tiny mustache-like renderer for {{ field.x }} / {{ attribution.x }} / {{ scalar }}.
// Returns warnings for missing keys so callers can log without throwing.

import type { Lead } from '~~/app/types'

export interface RenderResult {
  text: string
  warnings: string[]
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function resolve(lead: Lead, path: string): string | undefined {
  // Special prefix: 'field.x' → field_data.x for ergonomic templates.
  const norm = path.startsWith('field.') ? `field_data.${path.slice(6)}` : path
  const parts = norm.split('.')
  let cur: any = lead
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  if (cur === undefined || cur === null) return undefined
  return typeof cur === 'string' ? cur : String(cur)
}

export interface RenderOptions {
  html?: boolean
}

export function renderTemplate(
  template: string,
  lead: Lead,
  opts: RenderOptions = {},
): RenderResult {
  const warnings: string[] = []
  const text = template.replace(TOKEN, (_match, path: string) => {
    const v = resolve(lead, path)
    if (v === undefined) {
      warnings.push(path)
      return ''
    }
    return opts.html ? escapeHtml(v) : v
  })
  return { text, warnings }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm vitest run test/server/utils/leads/templateRender.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/leads/templateRender.ts test/server/utils/leads/templateRender.test.ts
git commit -m "feat(leads): template renderer with field.* shorthand and HTML escape"
```

---

### Task 6: Idempotency key generator (TDD)

**Files:**
- Create: `test/server/utils/leads/idempotency.test.ts`
- Create: `server/utils/leads/idempotency.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/leads/idempotency.test.ts
import { describe, it, expect } from 'vitest'
import { deliveryIdempotencyKey } from '../../../../server/utils/leads/idempotency'

describe('deliveryIdempotencyKey', () => {
  it('is deterministic for same lead+destination', () => {
    const a = deliveryIdempotencyKey('lead-1', 'dest-7')
    const b = deliveryIdempotencyKey('lead-1', 'dest-7')
    expect(a).toBe(b)
  })
  it('differs across leads or destinations', () => {
    expect(deliveryIdempotencyKey('lead-1', 'dest-7'))
      .not.toBe(deliveryIdempotencyKey('lead-2', 'dest-7'))
    expect(deliveryIdempotencyKey('lead-1', 'dest-7'))
      .not.toBe(deliveryIdempotencyKey('lead-1', 'dest-8'))
  })
  it('returns a stable hex string of fixed length', () => {
    const k = deliveryIdempotencyKey('lead-1', 'dest-7')
    expect(k).toMatch(/^[a-f0-9]{32}$/)
  })
})
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm vitest run test/server/utils/leads/idempotency.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// server/utils/leads/idempotency.ts
// Deterministic key for outbound delivery dedupe. Receivers can store this
// and reject repeats. Stable across our retries (we never regenerate it).

import { createHash } from 'node:crypto'

export function deliveryIdempotencyKey(leadId: string, destinationId: string): string {
  return createHash('md5').update(`${leadId}|${destinationId}`).digest('hex')
}
```

- [ ] **Step 4: Run, expect pass; commit**

```bash
pnpm vitest run test/server/utils/leads/idempotency.test.ts
git add server/utils/leads/idempotency.ts test/server/utils/leads/idempotency.test.ts
git commit -m "feat(leads): deterministic idempotency key for outbound deliveries"
```

---

### Task 7: Inbound rate-limit ring buffer (TDD)

**Files:**
- Create: `test/server/utils/leads/rateLimit.test.ts`
- Create: `server/utils/leads/rateLimit.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/leads/rateLimit.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { allowRequest, _resetRateLimitForTests } from '../../../../server/utils/leads/rateLimit'

beforeEach(() => { _resetRateLimitForTests(); vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())

describe('allowRequest', () => {
  it('allows up to N requests per window then 429s', () => {
    for (let i = 0; i < 5; i++) {
      expect(allowRequest('k1', 5, 60_000).allowed).toBe(true)
    }
    const blocked = allowRequest('k1', 5, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retry_after_ms).toBeGreaterThan(0)
  })
  it('keys are independent', () => {
    for (let i = 0; i < 5; i++) allowRequest('k1', 5, 60_000)
    expect(allowRequest('k2', 5, 60_000).allowed).toBe(true)
  })
  it('window slides — old entries expire', () => {
    for (let i = 0; i < 5; i++) allowRequest('k1', 5, 60_000)
    vi.advanceTimersByTime(61_000)
    expect(allowRequest('k1', 5, 60_000).allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm vitest run test/server/utils/leads/rateLimit.test.ts
```

- [ ] **Step 3: Implement**

```ts
// server/utils/leads/rateLimit.ts
// Per-Worker in-memory sliding window. Good enough for v1 — there's only
// one Pages instance per region, and exceeding the limit returns 429 quickly
// rather than blocking. If we outgrow this, swap for Durable Object counters.

const buckets = new Map<string, number[]>()  // key -> sorted timestamps (ms)

export interface AllowResult {
  allowed: boolean
  retry_after_ms?: number
}

export function allowRequest(key: string, max: number, windowMs: number): AllowResult {
  const now = Date.now()
  const cutoff = now - windowMs
  let arr = buckets.get(key) ?? []
  // Drop expired
  while (arr.length && arr[0] < cutoff) arr.shift()
  if (arr.length >= max) {
    const earliest = arr[0]
    return { allowed: false, retry_after_ms: Math.max(1, earliest + windowMs - now) }
  }
  arr.push(now)
  buckets.set(key, arr)
  return { allowed: true }
}

/** Test-only reset — DO NOT call from production code. */
export function _resetRateLimitForTests(): void {
  buckets.clear()
}
```

- [ ] **Step 4: Run, expect pass; commit**

```bash
pnpm vitest run test/server/utils/leads/rateLimit.test.ts
git add server/utils/leads/rateLimit.ts test/server/utils/leads/rateLimit.test.ts
git commit -m "feat(leads): in-memory sliding-window rate limiter for inbound webhooks"
```

---

## Section C — Normalizer + auto-assignment

### Task 8: Normalizer (TDD)

**Files:**
- Create: `test/server/utils/leads/normalizer.test.ts`
- Create: `server/utils/leads/normalizer.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/leads/normalizer.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeGooglePayload, normalizeManualPayload } from '../../../../server/utils/leads/normalizer'

describe('normalizeGooglePayload', () => {
  const payload = {
    lead_id: 'gads-123',
    api_version: '1.0',
    form_id: 'form-9',
    campaign_id: '888',
    gcl_id: 'gxyz',
    user_column_data: [
      { column_name: 'EMAIL', string_value: 'jane@acme.co' },
      { column_name: 'FULL_NAME', string_value: 'Jane Doe' },
      { column_name: 'PHONE_NUMBER', string_value: '+61400000001' },
    ],
  }
  it('produces canonical InsertLeadInput shape', () => {
    const out = normalizeGooglePayload(payload, 'client-1')
    expect(out.source).toBe('google')
    expect(out.source_lead_id).toBe('gads-123')
    expect(out.client_id).toBe('client-1')
    expect(out.form_id).toBe('form-9')
    expect(out.field_data.email).toBe('jane@acme.co')
    expect(out.field_data.full_name).toBe('Jane Doe')
    expect(out.field_data.phone_number).toBe('+61400000001')
    expect(out.attribution?.gclid).toBe('gxyz')
    expect(typeof out.submitted_at).toBe('string')
  })
  it('lower-cases column names and skips empty values', () => {
    const out = normalizeGooglePayload({
      ...payload,
      user_column_data: [
        { column_name: 'WEIRD CASE', string_value: 'x' },
        { column_name: 'EMPTY', string_value: '' },
      ],
    }, 'client-1')
    expect(out.field_data.weird_case).toBe('x')
    expect(out.field_data.empty).toBeUndefined()
  })
})

describe('normalizeManualPayload', () => {
  it('generates deterministic-shape output with source=manual', () => {
    const out = normalizeManualPayload({
      client_id: 'C1',
      field_data: { email: 'a@b.co', notes: 'walk-in' },
      form_name: 'Phone-In',
      created_by: 'U1',
    })
    expect(out.source).toBe('manual')
    expect(out.client_id).toBe('C1')
    expect(out.form_id).toBeNull()
    expect(out.field_data.email).toBe('a@b.co')
    expect(out.created_by).toBe('U1')
    expect(out.source_lead_id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm vitest run test/server/utils/leads/normalizer.test.ts
```

- [ ] **Step 3: Implement**

```ts
// server/utils/leads/normalizer.ts
// Convert raw provider payloads into the InsertLeadInput shape consumed by db.ts.
// Pure: no DB, no env access.

import { randomUUID } from 'node:crypto'
import type { InsertLeadInput } from './db'

interface GoogleColumn { column_name: string; string_value: string }
export interface GooglePayload {
  lead_id: string
  api_version?: string
  form_id?: string
  campaign_id?: string
  gcl_id?: string
  user_column_data: GoogleColumn[]
  google_key?: string
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

export function normalizeGooglePayload(p: GooglePayload, clientId: string | null): InsertLeadInput {
  const fields: Record<string, string> = {}
  for (const c of p.user_column_data ?? []) {
    if (!c.string_value) continue
    const k = normalizeKey(c.column_name)
    if (k) fields[k] = c.string_value
  }
  return {
    client_id: clientId,
    source: 'google',
    source_lead_id: String(p.lead_id),
    form_id: p.form_id ?? null,
    form_name: null,
    ad_id: null,
    ad_name: null,
    campaign_id: p.campaign_id ?? null,
    campaign_name: null,
    page_id: null,
    submitted_at: new Date().toISOString(),
    field_data: fields,
    attribution: p.gcl_id ? { gclid: p.gcl_id } : null,
    assigned_to: null,
    created_by: null,
  }
}

export interface ManualInput {
  client_id: string
  field_data: Record<string, string>
  form_name?: string | null
  created_by: string
}

export function normalizeManualPayload(input: ManualInput): InsertLeadInput {
  return {
    client_id: input.client_id,
    source: 'manual',
    source_lead_id: randomUUID(),
    form_id: null,
    form_name: input.form_name ?? null,
    ad_id: null, ad_name: null,
    campaign_id: null, campaign_name: null,
    page_id: null,
    submitted_at: new Date().toISOString(),
    field_data: input.field_data,
    attribution: null,
    assigned_to: null,
    created_by: input.created_by,
  }
}
```

- [ ] **Step 4: Run, expect pass; commit**

```bash
pnpm vitest run test/server/utils/leads/normalizer.test.ts
git add server/utils/leads/normalizer.ts test/server/utils/leads/normalizer.test.ts
git commit -m "feat(leads): payload normalizer for Google + manual entry"
```

---

### Task 9: Auto-assignment from `client_team_assignments`

**Files:**
- Create: `server/utils/leads/autoAssign.ts`
- Create: `test/server/utils/leads/autoAssign.test.ts`

- [ ] **Step 1: Write the failing test (uses mocked db)**

```ts
// test/server/utils/leads/autoAssign.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(),
}))

import { queryOne } from '~~/server/utils/db'
import { resolveAssignedAm } from '../../../../server/utils/leads/autoAssign'

describe('resolveAssignedAm', () => {
  it('returns the primary AM for the client', async () => {
    ;(queryOne as any).mockResolvedValueOnce({ team_member_id: 'U-AM-1' })
    expect(await resolveAssignedAm('C1')).toBe('U-AM-1')
  })
  it('returns null if no assignment', async () => {
    ;(queryOne as any).mockResolvedValueOnce(null)
    expect(await resolveAssignedAm('C2')).toBeNull()
  })
  it('returns null when client_id is null', async () => {
    expect(await resolveAssignedAm(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm vitest run test/server/utils/leads/autoAssign.test.ts
```

- [ ] **Step 3: Implement**

```ts
// server/utils/leads/autoAssign.ts
import { queryOne } from '~~/server/utils/db'

/**
 * Resolve the team_member_id of the primary AM for a client, if any.
 * Falls back to null when no assignment exists or client_id is null.
 */
export async function resolveAssignedAm(clientId: string | null): Promise<string | null> {
  if (!clientId) return null
  const row = await queryOne<{ team_member_id: string }>(`
    SELECT team_member_id FROM client_team_assignments
    WHERE client_id = $1 AND role = 'primary_am'
    ORDER BY assigned_at DESC
    LIMIT 1
  `, [clientId])
  return row?.team_member_id ?? null
}
```

- [ ] **Step 4: Run, expect pass; commit**

```bash
pnpm vitest run test/server/utils/leads/autoAssign.test.ts
git add server/utils/leads/autoAssign.ts test/server/utils/leads/autoAssign.test.ts
git commit -m "feat(leads): auto-assignment from client_team_assignments"
```

---

## Section D — Rules engine + queue producer

### Task 10: Rules engine

**Files:**
- Create: `server/utils/leads/rulesEngine.ts`
- Create: `test/server/utils/leads/rulesEngine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/server/utils/leads/rulesEngine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db', () => ({
  loadLead: vi.fn(),
  loadRuleForForm: vi.fn(),
  insertDelivery: vi.fn().mockResolvedValue('D1'),
  insertCancelledPlaceholder: vi.fn(),
}))

import * as db from '../../../../server/utils/leads/db'
import { evaluateLead } from '../../../../server/utils/leads/rulesEngine'

const lead = {
  id: 'L1', client_id: 'C1', source: 'google', source_lead_id: 's1',
  form_id: 'F1', form_name: null, ad_id: null, ad_name: null,
  campaign_id: null, campaign_name: null, page_id: null,
  submitted_at: '2026-04-30T10:00:00Z', ingested_at: '2026-04-30T10:00:01Z',
  field_data: { country: 'AU', budget: '8000' }, attribution: null,
  score: null, score_reasons: null, status: 'new', spam_reasons: null,
  assigned_to: null, contacted_at: null, contacted_by: null, notes: null,
  created_by: null, deleted_at: null, created_at: '2026-04-30T10:00:01Z',
}

beforeEach(() => vi.clearAllMocks())

describe('evaluateLead', () => {
  it('writes a cancelled placeholder when no rule', async () => {
    ;(db.loadLead as any).mockResolvedValueOnce(lead)
    ;(db.loadRuleForForm as any).mockResolvedValueOnce(null)
    const out = await evaluateLead('L1')
    expect(out.deliveries).toEqual([])
    expect(db.insertCancelledPlaceholder).toHaveBeenCalledWith('L1', 'no_rule_configured')
  })
  it('cancelled when rule disabled', async () => {
    ;(db.loadLead as any).mockResolvedValueOnce(lead)
    ;(db.loadRuleForForm as any).mockResolvedValueOnce({
      rule: { id: 'R1', enabled: false }, destinations: [],
    })
    const out = await evaluateLead('L1')
    expect(out.deliveries).toEqual([])
    expect(db.insertCancelledPlaceholder).toHaveBeenCalledWith('L1', 'rule_disabled')
  })
  it('inserts a delivery per matching destination', async () => {
    ;(db.loadLead as any).mockResolvedValueOnce(lead)
    ;(db.loadRuleForForm as any).mockResolvedValueOnce({
      rule: { id: 'R1', enabled: true },
      destinations: [
        { id: 'D-A', destination_type: 'slack', filter: null, delay_minutes: 0 },
        { id: 'D-B', destination_type: 'sms', filter: { field: 'field_data.country', op: 'eq', value: 'NZ' }, delay_minutes: 0 },
        { id: 'D-C', destination_type: 'webhook', filter: { field: 'field_data.budget', op: 'gt', value: 5000 }, delay_minutes: 5 },
      ],
    })
    const out = await evaluateLead('L1')
    expect(out.deliveries.map(d => d.destination_id)).toEqual(['D-A', 'D-C'])
    expect(db.insertDelivery).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm vitest run test/server/utils/leads/rulesEngine.test.ts
```

- [ ] **Step 3: Implement**

```ts
// server/utils/leads/rulesEngine.ts
import {
  loadLead, loadRuleForForm, insertDelivery, insertCancelledPlaceholder,
} from './db'
import { evaluateFilter } from './filterEval'
import { deliveryIdempotencyKey } from './idempotency'

export interface PlannedDelivery {
  delivery_id: string
  destination_id: string
  destination_type: string
  scheduled_at: string
  delay_minutes: number
}

export async function evaluateLead(
  leadId: string,
): Promise<{ leadId: string; deliveries: PlannedDelivery[] }> {
  const lead = await loadLead(leadId)
  if (!lead) return { leadId, deliveries: [] }

  if (lead.source === 'manual' || !lead.form_id) {
    // Manual leads + leads without a form skip rules entirely.
    return { leadId, deliveries: [] }
  }

  const bundle = await loadRuleForForm(lead.source as 'meta' | 'google', lead.form_id)
  if (!bundle) {
    await insertCancelledPlaceholder(leadId, 'no_rule_configured')
    return { leadId, deliveries: [] }
  }
  if (!bundle.rule.enabled) {
    await insertCancelledPlaceholder(leadId, 'rule_disabled')
    return { leadId, deliveries: [] }
  }

  const planned: PlannedDelivery[] = []
  for (const dest of bundle.destinations) {
    if (!evaluateFilter(lead, dest.filter as any)) continue
    const scheduledAt = new Date(Date.now() + dest.delay_minutes * 60_000).toISOString()
    const key = deliveryIdempotencyKey(lead.id, dest.id)
    const id = await insertDelivery({
      lead_id: lead.id,
      rule_destination_id: dest.id,
      destination_type: dest.destination_type,
      scheduled_at: scheduledAt,
      idempotency_key: key,
    })
    planned.push({
      delivery_id: id,
      destination_id: dest.id,
      destination_type: dest.destination_type,
      scheduled_at: scheduledAt,
      delay_minutes: dest.delay_minutes,
    })
  }
  return { leadId, deliveries: planned }
}
```

- [ ] **Step 4: Run, expect pass; commit**

```bash
pnpm vitest run test/server/utils/leads/rulesEngine.test.ts
git add server/utils/leads/rulesEngine.ts test/server/utils/leads/rulesEngine.test.ts
git commit -m "feat(leads): rules engine — fan-out with filters and delays"
```

---

### Task 11: Queue producer with graceful inline fallback

**Files:**
- Create: `server/utils/leads/queue.ts`

- [ ] **Step 1: Implement**

```ts
// server/utils/leads/queue.ts
// Producer-side: enqueue a delivery to LEADS_DELIVERY_QUEUE if available,
// otherwise dispatch inline (dev / no-binding fallback). The companion
// Worker is the queue consumer; this file never consumes.

export interface QueueMessage {
  type: 'rules.evaluate' | 'delivery.dispatch'
  payload: { lead_id?: string; delivery_id?: string }
  attempt?: number
  delaySeconds?: number
}

export async function enqueue(msg: QueueMessage): Promise<void> {
  const event = (globalThis as any).useEvent?.()
  const queue = event?.context?.cloudflare?.env?.LEADS_DELIVERY_QUEUE
  if (queue && typeof queue.send === 'function') {
    const opts = msg.delaySeconds ? { delaySeconds: Math.min(43200, msg.delaySeconds) } : undefined
    await queue.send(msg, opts as any)
    return
  }
  // Fallback: inline dispatch via dynamic import (avoids circular import at top)
  const { handleQueueMessage } = await import('./dispatch')
  await handleQueueMessage(msg)
}
```

- [ ] **Step 2: Commit (covered by next task's tests)**

```bash
git add server/utils/leads/queue.ts
git commit -m "feat(leads): queue producer with inline-dispatch fallback"
```

---

## Section E — Destination adapters

### Task 12: Adapter interface + registry

**Files:**
- Create: `server/utils/leads/destinations/types.ts`
- Create: `server/utils/leads/destinations/index.ts`

- [ ] **Step 1: Implement types**

```ts
// server/utils/leads/destinations/types.ts
import type { Lead, LeadDelivery, DispatchResult } from '~~/app/types'

export interface DestinationAdapter<C = any> {
  type: string
  validateConfig(config: unknown): { valid: boolean; errors?: Record<string, string> }
  dispatch(delivery: LeadDelivery, lead: Lead, config: C): Promise<DispatchResult>
}

export type { DispatchResult, Lead, LeadDelivery }
```

- [ ] **Step 2: Implement registry skeleton (adapters added in next tasks)**

```ts
// server/utils/leads/destinations/index.ts
import type { DestinationAdapter } from './types'

const REGISTRY = new Map<string, DestinationAdapter>()

export function registerAdapter(a: DestinationAdapter): void {
  REGISTRY.set(a.type, a)
}

export function getAdapter(type: string): DestinationAdapter | null {
  return REGISTRY.get(type) ?? null
}

export function listAdapterTypes(): string[] {
  return [...REGISTRY.keys()]
}

// Side-effect import: each adapter file calls registerAdapter on load.
import './portal'
import './webhook'
import './slack'
import './email'
import './sheets'
import './assignUser'
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/leads/destinations/types.ts server/utils/leads/destinations/index.ts
git commit -m "feat(leads): destination adapter interface + registry"
```

---

### Task 13: `portal` adapter

**Files:**
- Create: `server/utils/leads/destinations/portal.ts`

- [ ] **Step 1: Implement**

```ts
// server/utils/leads/destinations/portal.ts
import { registerAdapter } from './index'
import type { DestinationAdapter } from './types'

const adapter: DestinationAdapter = {
  type: 'portal',
  validateConfig: () => ({ valid: true }),
  // The portal adapter is a no-op at dispatch time. The lead is already in DB
  // and visible in the agency Inbox; the existence of a `portal` destination
  // in the rule is what makes it visible in the client portal (queried at read time).
  dispatch: async () => ({ status: 'delivered', response_meta: { type: 'portal' } }),
}

registerAdapter(adapter)
export default adapter
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/leads/destinations/portal.ts
git commit -m "feat(leads): portal destination adapter (no-op marker)"
```

---

### Task 14: `webhook` adapter (with TDD on SSRF + signing + idempotency)

**Files:**
- Create: `server/utils/leads/destinations/webhook.ts`
- Create: `test/server/utils/leads/destinations/webhook.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/leads/destinations/webhook.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import adapter from '../../../../../server/utils/leads/destinations/webhook'

const baseLead: any = {
  id: 'L1', source: 'google', source_lead_id: 's1', field_data: { email: 'a@b.co' },
  attribution: null, status: 'new', form_id: 'F1',
}
const baseDelivery: any = {
  id: 'D1', lead_id: 'L1', idempotency_key: 'idem-1', destination_type: 'webhook',
}

describe('validateConfig', () => {
  it('requires HTTPS', () => {
    expect(adapter.validateConfig({ url: 'http://evil.example' }).valid).toBe(false)
  })
  it('blocks localhost / private IPs (SSRF)', () => {
    expect(adapter.validateConfig({ url: 'https://localhost/x' }).valid).toBe(false)
    expect(adapter.validateConfig({ url: 'https://127.0.0.1/x' }).valid).toBe(false)
    expect(adapter.validateConfig({ url: 'https://10.0.0.5/x' }).valid).toBe(false)
    expect(adapter.validateConfig({ url: 'https://192.168.1.1/x' }).valid).toBe(false)
    expect(adapter.validateConfig({ url: 'https://169.254.169.254/' }).valid).toBe(false)
  })
  it('rejects CRLF-injected headers', () => {
    expect(adapter.validateConfig({
      url: 'https://x.example/h',
      headers: { 'X-Bad': 'v\r\nInjected: y' },
    }).valid).toBe(false)
  })
  it('accepts a valid HTTPS URL', () => {
    expect(adapter.validateConfig({ url: 'https://acme.example.com/leads' }).valid).toBe(true)
  })
})

describe('dispatch', () => {
  beforeEach(() => vi.restoreAllMocks())
  it('POSTs JSON with idempotency header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await adapter.dispatch(baseDelivery, baseLead, { url: 'https://x.example/h' })
    expect(r.status).toBe('delivered')
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['X-Leads-Idempotency-Key']).toBe('idem-1')
    expect(init.headers['Content-Type']).toBe('application/json')
  })
  it('adds HMAC signature when secret provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await adapter.dispatch(baseDelivery, baseLead, { url: 'https://x.example/h', secret: 'top-secret' })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['X-Leads-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/)
  })
  it('returns failed on 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 503 })))
    const r = await adapter.dispatch(baseDelivery, baseLead, { url: 'https://x.example/h' })
    expect(r.status).toBe('failed')
  })
  it('returns failed on 4xx but with retry suppression hint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 400 })))
    const r = await adapter.dispatch(baseDelivery, baseLead, { url: 'https://x.example/h' })
    expect(r.status).toBe('failed')
    expect((r as any).retry_after_ms).toBeUndefined() // worker treats no hint + 4xx as no retry
  })
  it('honors 429 Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('rl', { status: 429, headers: { 'Retry-After': '7' } }),
    ))
    const r = await adapter.dispatch(baseDelivery, baseLead, { url: 'https://x.example/h' })
    expect(r.status).toBe('failed')
    expect((r as any).retry_after_ms).toBe(7000)
  })
})
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm vitest run test/server/utils/leads/destinations/webhook.test.ts
```

- [ ] **Step 3: Implement**

```ts
// server/utils/leads/destinations/webhook.ts
import { createHmac } from 'node:crypto'
import { registerAdapter } from './index'
import type { DestinationAdapter, DispatchResult } from './types'

interface Cfg { url: string; method?: 'POST' | 'PUT'; headers?: Record<string, string>; secret?: string }

const PRIVATE_HOST_RE = /^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|169\.254\.|0\.0\.0\.0$|::1$)/i

function isPrivateHost(host: string): boolean {
  return PRIVATE_HOST_RE.test(host)
}

const adapter: DestinationAdapter<Cfg> = {
  type: 'webhook',
  validateConfig(config) {
    const errors: Record<string, string> = {}
    const c = config as Cfg
    if (!c?.url || typeof c.url !== 'string') errors.url = 'URL required'
    else {
      try {
        const u = new URL(c.url)
        if (u.protocol !== 'https:') errors.url = 'HTTPS required'
        else if (isPrivateHost(u.hostname)) errors.url = 'Private/loopback hosts blocked'
      } catch { errors.url = 'Invalid URL' }
    }
    if (c?.headers) {
      for (const [k, v] of Object.entries(c.headers)) {
        if (typeof v !== 'string' || /[\r\n]/.test(v)) {
          errors.headers = `Invalid value for ${k}`
          break
        }
      }
    }
    if (c?.method && !['POST', 'PUT'].includes(c.method)) errors.method = 'POST or PUT only'
    if (c?.secret && typeof c.secret !== 'string') errors.secret = 'Must be string'
    return Object.keys(errors).length === 0 ? { valid: true } : { valid: false, errors }
  },
  async dispatch(delivery, lead, config) {
    const v = adapter.validateConfig(config)
    if (!v.valid) return { status: 'failed', error: `invalid_config: ${JSON.stringify(v.errors)}` }
    const body = JSON.stringify({
      delivery_id: delivery.id,
      idempotency_key: delivery.idempotency_key,
      lead: {
        id: lead.id, source: lead.source, source_lead_id: lead.source_lead_id,
        form_id: lead.form_id, form_name: lead.form_name,
        submitted_at: lead.submitted_at, field_data: lead.field_data,
        attribution: lead.attribution, status: lead.status,
      },
    })
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Leads-Idempotency-Key': delivery.idempotency_key,
      ...(config.headers ?? {}),
    }
    if (config.secret) {
      const sig = createHmac('sha256', config.secret).update(body).digest('hex')
      headers['X-Leads-Signature'] = `sha256=${sig}`
    }
    let resp: Response
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 30_000)
      try {
        resp = await fetch(config.url, {
          method: config.method ?? 'POST',
          headers, body, signal: ctrl.signal,
        })
      } finally { clearTimeout(timer) }
    } catch (e: any) {
      return { status: 'failed', error: `network_error: ${e?.message ?? String(e)}` }
    }
    if (resp.ok) {
      return { status: 'delivered', response_meta: { http_status: resp.status } }
    }
    const result: DispatchResult = { status: 'failed', error: `http_${resp.status}` }
    if (resp.status === 429) {
      const ra = resp.headers.get('Retry-After')
      const seconds = ra ? Number(ra) : 60
      ;(result as any).retry_after_ms = (Number.isFinite(seconds) ? seconds : 60) * 1000
    }
    return result
  },
}

registerAdapter(adapter)
export default adapter
```

- [ ] **Step 4: Run, expect pass; commit**

```bash
pnpm vitest run test/server/utils/leads/destinations/webhook.test.ts
git add server/utils/leads/destinations/webhook.ts test/server/utils/leads/destinations/webhook.test.ts
git commit -m "feat(leads): webhook adapter — HTTPS-only, SSRF defense, HMAC, idempotency header"
```

---

### Task 15: `slack` adapter

**Files:**
- Create: `server/utils/leads/destinations/slack.ts`

- [ ] **Step 1: Implement**

```ts
// server/utils/leads/destinations/slack.ts
import { registerAdapter } from './index'
import type { DestinationAdapter, DispatchResult } from './types'

interface Cfg { webhook_url: string; channel?: string; mention?: string }

function summary(lead: any): string {
  const f = lead.field_data ?? {}
  const parts: string[] = []
  if (f.full_name) parts.push(`*${f.full_name}*`)
  if (f.email) parts.push(`✉️ ${f.email}`)
  if (f.phone_number || f.phone) parts.push(`📞 ${f.phone_number ?? f.phone}`)
  if (f.budget) parts.push(`💰 ${f.budget}`)
  return parts.join(' · ')
}

const adapter: DestinationAdapter<Cfg> = {
  type: 'slack',
  validateConfig(config) {
    const c = config as Cfg
    if (!c?.webhook_url || !/^https:\/\/hooks\.slack\.com\/services\//.test(c.webhook_url)) {
      return { valid: false, errors: { webhook_url: 'Must be a Slack incoming webhook URL' } }
    }
    return { valid: true }
  },
  async dispatch(_delivery, lead, config) {
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${config.mention ? config.mention + ' ' : ''}*New lead* — ${lead.source}/${lead.form_name ?? lead.form_id ?? 'unknown'}\n${summary(lead)}`,
        },
      },
    ]
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 30_000)
      let resp: Response
      try {
        resp = await fetch(config.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks, channel: config.channel }),
          signal: ctrl.signal,
        })
      } finally { clearTimeout(timer) }
      if (!resp.ok) {
        const result: DispatchResult = { status: 'failed', error: `http_${resp.status}` }
        if (resp.status === 429) (result as any).retry_after_ms = 60_000
        return result
      }
      return { status: 'delivered', response_meta: { http_status: resp.status } }
    } catch (e: any) {
      return { status: 'failed', error: `network_error: ${e?.message ?? String(e)}` }
    }
  },
}

registerAdapter(adapter)
export default adapter
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/leads/destinations/slack.ts
git commit -m "feat(leads): slack adapter — Block Kit card to incoming webhook"
```

---

### Task 16: `email` adapter (Resend)

**Files:**
- Create: `server/utils/leads/destinations/email.ts`
- Create: `test/server/utils/leads/destinations/email.test.ts`

- [ ] **Step 1: Failing test (mock Resend)**

```ts
// test/server/utils/leads/destinations/email.test.ts
import { describe, it, expect, vi } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ data: { id: 'r1' }, error: null })
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })) }))

import adapter from '../../../../../server/utils/leads/destinations/email'

const lead: any = {
  id: 'L1', source: 'google', form_name: 'Quote',
  field_data: { first_name: 'Jane', email: 'jane@acme.co' }, attribution: null,
}
const delivery: any = { id: 'D1', idempotency_key: 'idem-1' }

describe('email adapter', () => {
  it('rejects invalid `to`', () => {
    const v = adapter.validateConfig({ to: ['nope'], subject_template: 's', body_template: 'b' })
    expect(v.valid).toBe(false)
  })
  it('renders subject + body templates', async () => {
    process.env.RESEND_API_KEY = 'test'
    const r = await adapter.dispatch(delivery, lead, {
      to: ['ops@adme.net.au'],
      subject_template: 'New lead from {{ field.first_name }}',
      body_template: 'Email: {{ field.email }}',
    })
    expect(r.status).toBe('delivered')
    expect(sendMock).toHaveBeenCalled()
    const [arg] = sendMock.mock.calls[0]
    expect(arg.subject).toBe('New lead from Jane')
    expect(arg.html).toContain('jane@acme.co')
  })
})
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm vitest run test/server/utils/leads/destinations/email.test.ts
```

- [ ] **Step 3: Implement**

```ts
// server/utils/leads/destinations/email.ts
import { Resend } from 'resend'
import { registerAdapter } from './index'
import { renderTemplate } from '../templateRender'
import type { DestinationAdapter } from './types'

interface Cfg {
  to: string[]
  subject_template: string
  body_template: string
  from?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const adapter: DestinationAdapter<Cfg> = {
  type: 'email',
  validateConfig(config) {
    const errors: Record<string, string> = {}
    const c = config as Cfg
    if (!Array.isArray(c?.to) || c.to.length === 0) errors.to = 'At least one recipient'
    else if (c.to.some(t => !EMAIL_RE.test(t))) errors.to = 'Invalid email address'
    if (!c?.subject_template) errors.subject_template = 'Required'
    if (!c?.body_template) errors.body_template = 'Required'
    return Object.keys(errors).length ? { valid: false, errors } : { valid: true }
  },
  async dispatch(delivery, lead, config) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return { status: 'failed', error: 'RESEND_API_KEY missing' }
    const resend = new Resend(apiKey)
    const subject = renderTemplate(config.subject_template, lead).text
    const html = renderTemplate(config.body_template, lead, { html: true }).text
    try {
      const { data, error } = await resend.emails.send({
        from: config.from ?? 'leads@adme.net.au',
        to: config.to,
        subject,
        html,
        headers: { 'X-Leads-Idempotency-Key': delivery.idempotency_key },
      })
      if (error) return { status: 'failed', error: error.message ?? 'resend_error' }
      return { status: 'delivered', response_meta: { resend_id: data?.id } }
    } catch (e: any) {
      return { status: 'failed', error: `resend_error: ${e?.message ?? String(e)}` }
    }
  },
}

registerAdapter(adapter)
export default adapter
```

- [ ] **Step 4: Run, expect pass; commit**

```bash
pnpm vitest run test/server/utils/leads/destinations/email.test.ts
git add server/utils/leads/destinations/email.ts test/server/utils/leads/destinations/email.test.ts
git commit -m "feat(leads): email adapter via Resend with template rendering"
```

---

### Task 17: `sheets` adapter (with friendly scope-missing error)

**Files:**
- Create: `server/utils/leads/destinations/sheets.ts`

- [ ] **Step 1: Implement**

```ts
// server/utils/leads/destinations/sheets.ts
import { registerAdapter } from './index'
import { queryOne } from '~~/server/utils/db'
import type { DestinationAdapter } from './types'

interface Cfg { spreadsheet_id: string; sheet_name: string }

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

async function loadGoogleAccessToken(): Promise<{ token: string | null; hasScope: boolean }> {
  // Pulls from social_connections.platform='google'. Returns the first active row's token.
  const row = await queryOne<{ access_token: string; scopes: string[] }>(`
    SELECT access_token, scopes FROM social_connections
    WHERE platform = 'google' AND status = 'active' AND access_token IS NOT NULL
    ORDER BY updated_at DESC LIMIT 1
  `)
  if (!row) return { token: null, hasScope: false }
  return { token: row.access_token, hasScope: (row.scopes ?? []).includes(SHEETS_SCOPE) }
}

const adapter: DestinationAdapter<Cfg> = {
  type: 'sheets',
  validateConfig(config) {
    const errors: Record<string, string> = {}
    const c = config as Cfg
    if (!c?.spreadsheet_id || c.spreadsheet_id.length < 20) errors.spreadsheet_id = 'Looks invalid'
    if (!c?.sheet_name) errors.sheet_name = 'Required'
    return Object.keys(errors).length ? { valid: false, errors } : { valid: true }
  },
  async dispatch(_delivery, lead, config) {
    const { token, hasScope } = await loadGoogleAccessToken()
    if (!token) return { status: 'failed', error: 'no_google_connection' }
    if (!hasScope) {
      return { status: 'failed', error: 'missing_scope:reconnect_google_with_spreadsheets_scope' }
    }
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheet_id)}/values/${encodeURIComponent(config.sheet_name)}!A:Z:append?valueInputOption=RAW`
    const row = [
      lead.submitted_at, lead.source, lead.form_name ?? lead.form_id ?? '',
      lead.field_data?.full_name ?? '', lead.field_data?.email ?? '',
      lead.field_data?.phone_number ?? lead.field_data?.phone ?? '',
      JSON.stringify(lead.field_data ?? {}),
    ]
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 30_000)
      let resp: Response
      try {
        resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [row] }),
          signal: ctrl.signal,
        })
      } finally { clearTimeout(timer) }
      if (!resp.ok) {
        return { status: 'failed', error: `sheets_http_${resp.status}` }
      }
      return { status: 'delivered', response_meta: { http_status: resp.status } }
    } catch (e: any) {
      return { status: 'failed', error: `sheets_network: ${e?.message ?? String(e)}` }
    }
  },
}

registerAdapter(adapter)
export default adapter
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/leads/destinations/sheets.ts
git commit -m "feat(leads): sheets adapter with scope check and friendly error"
```

---

### Task 18: `assign_user` adapter

**Files:**
- Create: `server/utils/leads/destinations/assignUser.ts`

- [ ] **Step 1: Implement**

```ts
// server/utils/leads/destinations/assignUser.ts
import { registerAdapter } from './index'
import { execute } from '~~/server/utils/db'
import type { DestinationAdapter } from './types'

interface Cfg { user_id: string }

const adapter: DestinationAdapter<Cfg> = {
  type: 'assign_user',
  validateConfig(config) {
    const c = config as Cfg
    if (!c?.user_id || typeof c.user_id !== 'string') {
      return { valid: false, errors: { user_id: 'Required' } }
    }
    return { valid: true }
  },
  async dispatch(_delivery, lead, config) {
    const updated = await execute(
      `UPDATE leads SET assigned_to = $2 WHERE id = $1 AND deleted_at IS NULL`,
      [lead.id, config.user_id],
    )
    return updated > 0
      ? { status: 'delivered', response_meta: { user_id: config.user_id } }
      : { status: 'failed', error: 'lead_not_updatable' }
  },
}

registerAdapter(adapter)
export default adapter
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/leads/destinations/assignUser.ts
git commit -m "feat(leads): assign_user adapter — sets leads.assigned_to"
```

---

## Section F — Inner dispatch + queue consumer

### Task 19: Inner dispatch loop (`dispatch.ts`)

**Files:**
- Create: `server/utils/leads/dispatch.ts`

- [ ] **Step 1: Implement**

```ts
// server/utils/leads/dispatch.ts
// The execution side of the queue. Used both by the companion Worker and by
// the inline-fallback path in queue.ts when CF Queues are unavailable.

import {
  loadLead, loadRuleForForm, claimDelivery, releaseClaim,
  markDelivered, markFailed, markSkipped,
} from './db'
import { evaluateLead } from './rulesEngine'
import { getAdapter } from './destinations'
import { queryOne } from '~~/server/utils/db'
import type { LeadDelivery, LeadRuleDestination } from '~~/app/types'
import type { QueueMessage } from './queue'

const WORKER_ID = `inline-${Math.random().toString(36).slice(2, 10)}`
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000]

export async function handleQueueMessage(msg: QueueMessage): Promise<void> {
  if (msg.type === 'rules.evaluate' && msg.payload.lead_id) {
    const result = await evaluateLead(msg.payload.lead_id)
    // Each insertDelivery already triggered enqueue elsewhere — but in inline
    // mode we need to chain. Producer enqueues delivery.dispatch per planned id.
    const { enqueue } = await import('./queue')
    for (const d of result.deliveries) {
      await enqueue({
        type: 'delivery.dispatch',
        payload: { delivery_id: d.delivery_id },
        delaySeconds: d.delay_minutes * 60,
      })
    }
    return
  }
  if (msg.type === 'delivery.dispatch' && msg.payload.delivery_id) {
    await dispatchOne(msg.payload.delivery_id, msg.attempt ?? 0)
    return
  }
}

async function loadDestination(id: string): Promise<LeadRuleDestination | null> {
  return queryOne<LeadRuleDestination>(
    `SELECT * FROM lead_rule_destinations WHERE id = $1`,
    [id],
  )
}

async function dispatchOne(deliveryId: string, attempt: number): Promise<void> {
  const claimed = await claimDelivery(deliveryId, WORKER_ID)
  if (!claimed) return // someone else has it

  // Schedule check
  if (new Date(claimed.scheduled_at).getTime() > Date.now()) {
    await releaseClaim(deliveryId)
    const { enqueue } = await import('./queue')
    const delaySeconds = Math.max(1, Math.ceil((new Date(claimed.scheduled_at).getTime() - Date.now()) / 1000))
    await enqueue({ type: 'delivery.dispatch', payload: { delivery_id: deliveryId }, delaySeconds })
    return
  }

  // Re-validate
  const lead = await loadLead(claimed.lead_id)
  if (!lead || lead.deleted_at || lead.status === 'spam_suspected') {
    await markSkipped(deliveryId, 'lead_invalid')
    return
  }
  const dest = claimed.rule_destination_id ? await loadDestination(claimed.rule_destination_id) : null
  if (!dest || !dest.enabled) {
    await markSkipped(deliveryId, 'destination_disabled')
    return
  }
  if (lead.form_id) {
    const bundle = await loadRuleForForm(lead.source as 'meta' | 'google', lead.form_id)
    if (bundle && !bundle.rule.enabled) {
      await markSkipped(deliveryId, 'rule_disabled')
      return
    }
  }

  // Dispatch
  const adapter = getAdapter(claimed.destination_type)
  if (!adapter) {
    await markFailed(deliveryId, `unknown_adapter:${claimed.destination_type}`, claimed.retry_count, true)
    return
  }
  const result = await adapter.dispatch(claimed as LeadDelivery, lead, dest.config)

  if (result.status === 'delivered') {
    await markDelivered(deliveryId, result.response_meta)
    return
  }

  // Failure: classify retryability
  const next = claimed.retry_count + 1
  const final = next >= BACKOFF_MS.length
  await markFailed(deliveryId, result.error, next, final)
  if (final) return
  const delaySeconds = Math.ceil(((result as any).retry_after_ms ?? BACKOFF_MS[next]) / 1000)
  const { enqueue } = await import('./queue')
  await enqueue({ type: 'delivery.dispatch', payload: { delivery_id: deliveryId }, attempt: next, delaySeconds })
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/leads/dispatch.ts
git commit -m "feat(leads): inner dispatch loop — claim, re-validate, retry with backoff"
```

---

### Task 20: Companion Worker scaffold

**Files:**
- Create: `workers/leads-delivery-worker/wrangler.toml`
- Create: `workers/leads-delivery-worker/package.json`
- Create: `workers/leads-delivery-worker/src/index.ts`
- Create: `workers/leads-delivery-worker/tsconfig.json`

- [ ] **Step 1: Create `wrangler.toml`**

```toml
# workers/leads-delivery-worker/wrangler.toml
name = "leads-delivery-worker"
main = "src/index.ts"
compatibility_date = "2025-12-01"
compatibility_flags = ["nodejs_compat"]

# Configure queue consumer + bindings (DATABASE_URL, RESEND_API_KEY, HYPERDRIVE)
# in the Cloudflare dashboard — Pages projects can't declare consumers in toml.
# Locally, `wrangler dev` will need a queues.consumers stub if testing.

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "REPLACE_WITH_HYPERDRIVE_ID"

[vars]
WORKER_ID_PREFIX = "leads-w"
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "leads-delivery-worker",
  "private": true,
  "type": "module",
  "scripts": {
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

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `src/index.ts`**

```ts
// workers/leads-delivery-worker/src/index.ts
//
// CF Queue consumer for the leads engine. Imports the same dispatch loop the
// Pages app uses for inline fallback. Database access goes through HYPERDRIVE.
//
// IMPORTANT: this Worker shares server/utils/leads/* with the Pages app. The
// build step bundles them via path aliases configured in wrangler / esbuild.
// For v1 we copy the relevant files via a build script (see docs).
//
// queues.consumers binding configured in CF dashboard (NOT in wrangler.toml):
//   queue: leads-delivery-queue
//   max_batch_size: 10
//   max_batch_timeout: 5
//   max_retries: 0   (we manage retries in-app)
//   dead_letter_queue: leads-delivery-dlq

interface Env {
  HYPERDRIVE: { connectionString: string }
  DATABASE_URL: string
  RESEND_API_KEY: string
  WORKER_ID_PREFIX: string
}

type QueueMessageBody = {
  type: 'rules.evaluate' | 'delivery.dispatch'
  payload: { lead_id?: string; delivery_id?: string }
  attempt?: number
}

export default {
  async queue(batch: MessageBatch<QueueMessageBody>, env: Env, _ctx: ExecutionContext): Promise<void> {
    // Set DATABASE_URL for the shared db.ts (Hyperdrive preferred)
    if (env.HYPERDRIVE?.connectionString) {
      ;(globalThis as any).__HYPERDRIVE_CS = env.HYPERDRIVE.connectionString
    }
    process.env.DATABASE_URL = env.DATABASE_URL
    process.env.RESEND_API_KEY = env.RESEND_API_KEY

    // Lazy-import the dispatcher (built/copied into the bundle).
    const { handleQueueMessage } = await import('./dispatch')

    for (const msg of batch.messages) {
      try {
        await handleQueueMessage(msg.body)
        msg.ack()
      } catch (e) {
        console.error('queue.handler.error', e)
        msg.retry({ delaySeconds: 30 })
      }
    }
  },
}
```

- [ ] **Step 5: Add a build/copy step**

Create `workers/leads-delivery-worker/scripts/sync-shared.sh`:

```bash
#!/usr/bin/env bash
# Copies server/utils/leads/* into workers/leads-delivery-worker/src/ before deploy.
# Until we set up a proper monorepo or shared package, copy is the simplest path.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
DST="$ROOT/workers/leads-delivery-worker/src"
mkdir -p "$DST/leads"
cp -R "$ROOT/server/utils/leads/." "$DST/leads/"
# Re-export the dispatch entry from index for the Worker to import as './dispatch'
cat > "$DST/dispatch.ts" <<'EOF'
export { handleQueueMessage } from './leads/dispatch'
EOF
echo "synced shared leads code"
```

```bash
chmod +x workers/leads-delivery-worker/scripts/sync-shared.sh
```

- [ ] **Step 6: Commit**

```bash
git add workers/leads-delivery-worker
git commit -m "feat(leads): companion Worker scaffold for queue consumer"
```

> **Note for executor:** the Worker is not deployed in this plan — we test the dispatch logic via the inline fallback (`enqueue` falls through to `handleQueueMessage` when no binding exists). Worker deployment + queue consumer wiring lands in plan `1c` (ops).

---

### Task 21: Stuck-claim recovery (cron-style endpoint, schedule wired in plan 1c)

**Files:**
- Create: `server/api/leads/_internal/recover-stuck-claims.post.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/leads/_internal/recover-stuck-claims.post.ts
// Resets stuck `claimed` deliveries back to `pending` so the queue can pick them up.
// Hit by a cron in plan 1c. In dev, can be invoked manually for testing.

import { recoverStuckClaims } from '~~/server/utils/leads/db'

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization')
  const expected = `Bearer ${process.env.INTERNAL_CRON_TOKEN ?? ''}`
  if (!process.env.INTERNAL_CRON_TOKEN || auth !== expected) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const reset = await recoverStuckClaims(5)
  return { reset }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/api/leads/_internal/recover-stuck-claims.post.ts
git commit -m "feat(leads): stuck-claim recovery endpoint (cron target)"
```

---

## Section G — Ingestion endpoints

### Task 22: `GET /api/leads/webhook/google/[token].get.ts` (health probe)

**Files:**
- Create: `server/api/leads/webhook/google/[token].get.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/leads/webhook/google/[token].get.ts
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'token_required' })
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM lead_webhook_endpoints WHERE url_token = $1`, [token],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { ok: true, ready: true }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/api/leads/webhook/google/[token].get.ts
git commit -m "feat(leads): Google webhook health probe"
```

---

### Task 23: `POST /api/leads/webhook/google/[token].post.ts`

**Files:**
- Create: `server/api/leads/webhook/google/[token].post.ts`
- Create: `test/server/api/leads/webhook-google.test.ts`

- [ ] **Step 1: Failing integration test (high-level shape)**

```ts
// test/server/api/leads/webhook-google.test.ts
// Smoke-level test that exercises the handler logic via direct module call.
// Full HTTP-layer testing happens in Phase 1c via end-to-end staging run.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('~~/server/utils/db', () => {
  const queryOne = vi.fn()
  const execute = vi.fn().mockResolvedValue(0)
  return { queryOne, execute, queryRows: vi.fn() }
})
vi.mock('../../../../server/utils/leads/db', async () => {
  const real = await vi.importActual<any>('../../../../server/utils/leads/db')
  return {
    ...real,
    insertLeadWithDedup: vi.fn().mockResolvedValue('LEAD-1'),
    upsertFormMetadata: vi.fn(),
    logIngestionError: vi.fn(),
  }
})
vi.mock('../../../../server/utils/leads/queue', () => ({
  enqueue: vi.fn(),
}))
vi.mock('../../../../server/utils/leads/autoAssign', () => ({
  resolveAssignedAm: vi.fn().mockResolvedValue('AM-1'),
}))
vi.mock('../../../../server/utils/leads/rateLimit', () => ({
  allowRequest: vi.fn().mockReturnValue({ allowed: true }),
}))

import * as leadsDb from '../../../../server/utils/leads/db'
import { queryOne } from '~~/server/utils/db'
import { enqueue } from '../../../../server/utils/leads/queue'

const handler = (await import('../../../../server/api/leads/webhook/google/[token].post')).default

function fakeEvent(token: string, body: any, headers: Record<string, string> = {}) {
  return {
    context: { params: { token }, _h: headers },
    node: {
      req: {
        headers,
        on: () => {},
      },
      res: {},
    },
    _readBody: body,
  } as any
}

describe('POST /api/leads/webhook/google/[token]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 if no token row', async () => {
    ;(queryOne as any).mockResolvedValueOnce(null)
    await expect(handler(fakeEvent('bad', { google_key: 'x' }))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('401 if key mismatch', async () => {
    ;(queryOne as any).mockResolvedValueOnce({
      id: 'EP1', client_id: 'C1', secret_key: 'real', secret_key_previous: null,
      secret_key_grace_until: null,
    })
    await expect(handler(fakeEvent('t1', { google_key: 'wrong' }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('200 + enqueue on valid', async () => {
    ;(queryOne as any).mockResolvedValueOnce({
      id: 'EP1', client_id: 'C1', secret_key: 'real', secret_key_previous: null,
      secret_key_grace_until: null,
    })
    const body = {
      google_key: 'real',
      lead_id: 'g1', form_id: 'F1', campaign_id: 'CAM1',
      user_column_data: [{ column_name: 'EMAIL', string_value: 'a@b.co' }],
    }
    const r = await handler(fakeEvent('t1', body))
    expect(r).toMatchObject({ ok: true })
    expect(leadsDb.insertLeadWithDedup).toHaveBeenCalled()
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ type: 'rules.evaluate' }))
  })

  it('200 with skipped:true on dedup', async () => {
    ;(queryOne as any).mockResolvedValueOnce({
      id: 'EP1', client_id: 'C1', secret_key: 'real', secret_key_previous: null,
      secret_key_grace_until: null,
    })
    ;(leadsDb.insertLeadWithDedup as any).mockResolvedValueOnce(null)
    const r = await handler(fakeEvent('t1', {
      google_key: 'real', lead_id: 'g1', form_id: 'F1',
      user_column_data: [],
    }))
    expect(r).toMatchObject({ ok: true, skipped: true })
    expect(enqueue).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, confirm fail**

```bash
pnpm vitest run test/server/api/leads/webhook-google.test.ts
```

- [ ] **Step 3: Implement**

```ts
// server/api/leads/webhook/google/[token].post.ts
import { queryOne } from '~~/server/utils/db'
import {
  insertLeadWithDedup, upsertFormMetadata, logIngestionError,
} from '~~/server/utils/leads/db'
import { normalizeGooglePayload } from '~~/server/utils/leads/normalizer'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { allowRequest } from '~~/server/utils/leads/rateLimit'
import { enqueue } from '~~/server/utils/leads/queue'
import { timingSafeEqual } from 'node:crypto'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'token_required' })

  // Rate limit per token
  const rl = allowRequest(`google:${token}`, 200, 60_000)
  if (!rl.allowed) {
    setResponseHeader(event, 'Retry-After', String(Math.ceil((rl.retry_after_ms ?? 60_000) / 1000)))
    throw createError({ statusCode: 429, statusMessage: 'rate_limited' })
  }

  const ep = await queryOne<{
    id: string; client_id: string; secret_key: string;
    secret_key_previous: string | null; secret_key_grace_until: string | null;
  }>(`SELECT id, client_id, secret_key, secret_key_previous, secret_key_grace_until
      FROM lead_webhook_endpoints WHERE url_token = $1`, [token])
  if (!ep) throw createError({ statusCode: 404, statusMessage: 'unknown_token' })

  const body = await readBody(event).catch(() => null) as any
  if (!body || typeof body !== 'object') {
    await logIngestionError('google', body, getRequestHeaders(event), 'invalid_body')
    return { ok: true } // always-200
  }
  const submittedKey = String(body.google_key ?? '')
  const matchPrimary = safeEqual(submittedKey, ep.secret_key)
  const inGrace = ep.secret_key_previous &&
    ep.secret_key_grace_until &&
    new Date(ep.secret_key_grace_until).getTime() > Date.now()
  const matchPrevious = inGrace && safeEqual(submittedKey, ep.secret_key_previous!)
  if (!matchPrimary && !matchPrevious) {
    throw createError({ statusCode: 401, statusMessage: 'invalid_key' })
  }

  try {
    const norm = normalizeGooglePayload(body, ep.client_id)
    norm.assigned_to = await resolveAssignedAm(ep.client_id)
    const leadId = await insertLeadWithDedup(norm)
    if (norm.form_id) {
      await upsertFormMetadata('google', norm.form_id, norm.form_name, norm.field_data)
    }
    if (!leadId) return { ok: true, skipped: true }
    await enqueue({ type: 'rules.evaluate', payload: { lead_id: leadId } })
    return { ok: true, lead_id: leadId }
  } catch (e: any) {
    await logIngestionError('google', body, getRequestHeaders(event), e?.message ?? String(e))
    return { ok: true }
  }
})
```

- [ ] **Step 4: Run, expect pass; commit**

```bash
pnpm vitest run test/server/api/leads/webhook-google.test.ts
git add server/api/leads/webhook/google/[token].post.ts test/server/api/leads/webhook-google.test.ts
git commit -m "feat(leads): Google Lead Form webhook ingestion endpoint"
```

---

### Task 24: `POST /api/leads` (manual entry)

**Files:**
- Create: `server/api/leads/index.post.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/leads/index.post.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { insertLeadWithDedup } from '~~/server/utils/leads/db'
import { normalizeManualPayload } from '~~/server/utils/leads/normalizer'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'

const Body = z.object({
  client_id: z.string().uuid(),
  field_data: z.record(z.string()),
  form_name: z.string().optional().nullable(),
  notes: z.string().optional(),
  run_rules: z.boolean().optional().default(false),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }
  const norm = normalizeManualPayload({
    client_id: parsed.data.client_id,
    field_data: parsed.data.field_data,
    form_name: parsed.data.form_name ?? null,
    created_by: user.id,
  })
  norm.assigned_to = await resolveAssignedAm(parsed.data.client_id)
  const id = await insertLeadWithDedup(norm)
  return { ok: true, lead_id: id }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/api/leads/index.post.ts
git commit -m "feat(leads): manual lead entry endpoint"
```

---

## Section H — Agency lead-management API

### Task 25: `GET /api/leads/list` (filtered + paginated)

**Files:**
- Create: `server/api/leads/list.get.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/leads/list.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryCount } from '~~/server/utils/db'

const Query = z.object({
  client_id: z.string().uuid().optional(),
  source: z.enum(['meta', 'google', 'manual']).optional(),
  form_id: z.string().optional(),
  status: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  q: z.string().optional(), // free-text in field_data
  from: z.string().optional(),
  to: z.string().optional(),
  unmapped: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))

  const conds: string[] = ['deleted_at IS NULL']
  const params: any[] = []
  const push = (c: string, v: any) => { params.push(v); conds.push(c.replace('?', '$' + params.length)) }

  if (q.client_id) push('client_id = ?', q.client_id)
  if (q.unmapped) conds.push('client_id IS NULL')
  if (q.source) push('source = ?', q.source)
  if (q.form_id) push('form_id = ?', q.form_id)
  if (q.status) push('status = ?', q.status)
  if (q.assigned_to) push('assigned_to = ?', q.assigned_to)
  if (q.from) push('submitted_at >= ?', q.from)
  if (q.to) push('submitted_at <= ?', q.to)
  if (q.q) {
    // Search in JSONB serialized form (escape % and _ to neutralize ILIKE meta)
    const safe = q.q.replace(/[%_]/g, c => '\\' + c)
    push(`field_data::text ILIKE ?`, `%${safe}%`)
  }

  const where = `WHERE ${conds.join(' AND ')}`
  const offset = (q.page - 1) * q.page_size

  const rows = await queryRows(`
    SELECT * FROM leads ${where}
    ORDER BY submitted_at DESC
    LIMIT ${q.page_size} OFFSET ${offset}
  `, params)
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM leads ${where}`, params)
  return { items: rows, total, page: q.page, page_size: q.page_size }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/api/leads/list.get.ts
git commit -m "feat(leads): filtered + paginated agency list endpoint"
```

---

### Task 26: `GET /api/leads/[id]` and PATCH/DELETE

**Files:**
- Create: `server/api/leads/[id].get.ts`
- Create: `server/api/leads/[id].patch.ts`
- Create: `server/api/leads/[id].delete.ts`

- [ ] **Step 1: GET**

```ts
// server/api/leads/[id].get.ts
import { requireAuth } from '~~/server/utils/auth'
import { loadLead } from '~~/server/utils/leads/db'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const lead = await loadLead(id)
  if (!lead) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  const deliveries = await queryRows(
    `SELECT * FROM lead_deliveries WHERE lead_id = $1 ORDER BY created_at ASC`, [id],
  )
  return { lead, deliveries }
})
```

- [ ] **Step 2: PATCH**

```ts
// server/api/leads/[id].patch.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

const Body = z.object({
  status: z.enum(['new','contacted','qualified','won','lost','spam_suspected']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
}).refine(b => Object.keys(b).length > 0, { message: 'no fields' })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = Body.parse(await readBody(event))

  const sets: string[] = []
  const params: any[] = []
  const set = (col: string, val: any) => { params.push(val); sets.push(`${col} = $${params.length}`) }

  if (body.status) set('status', body.status)
  if ('assigned_to' in body) set('assigned_to', body.assigned_to)
  if ('notes' in body) set('notes', body.notes)
  if (body.status === 'contacted') {
    params.push(user.id); sets.push(`contacted_by = $${params.length}`)
    sets.push(`contacted_at = NOW()`)
  }
  params.push(id)
  await execute(`UPDATE leads SET ${sets.join(', ')} WHERE id = $${params.length} AND deleted_at IS NULL`, params)
  return { ok: true }
})
```

- [ ] **Step 3: DELETE (soft)**

```ts
// server/api/leads/[id].delete.ts
import { requireAuth } from '~~/server/utils/auth'
import { softDeleteLead } from '~~/server/utils/leads/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const n = await softDeleteLead(id)
  if (!n) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { ok: true }
})
```

- [ ] **Step 4: Commit**

```bash
git add server/api/leads/[id].get.ts server/api/leads/[id].patch.ts server/api/leads/[id].delete.ts
git commit -m "feat(leads): GET/PATCH/DELETE for individual leads"
```

---

### Task 27: Hard delete (purge), retry, export, stream

**Files:**
- Create: `server/api/leads/[id]/purge.delete.ts`
- Create: `server/api/leads/[id]/retry.post.ts`
- Create: `server/api/leads/export.get.ts`
- Create: `server/api/leads/stream.get.ts`

- [ ] **Step 1: Purge (admin only)**

```ts
// server/api/leads/[id]/purge.delete.ts
import { requireRole } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'
import { purgeLead } from '~~/server/utils/leads/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const id = getRouterParam(event, 'id')!
  // Redact ingestion errors that may include this lead's source_lead_id (best-effort).
  await execute(`UPDATE lead_ingestion_errors
    SET raw_payload = '{"redacted":true}'::jsonb
    WHERE raw_payload::text ILIKE $1`, [`%${id}%`])
  const n = await purgeLead(id)
  return { ok: true, purged: n > 0 }
})
```

- [ ] **Step 2: Retry**

```ts
// server/api/leads/[id]/retry.post.ts
import { requireAuth } from '~~/server/utils/auth'
import { execute, queryRows } from '~~/server/utils/db'
import { enqueue } from '~~/server/utils/leads/queue'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const failed = await queryRows<{ id: string }>(
    `SELECT id FROM lead_deliveries WHERE lead_id = $1 AND status = 'failed'`, [id],
  )
  if (failed.length === 0) return { ok: true, retried: 0 }
  await execute(`
    UPDATE lead_deliveries
    SET status = 'pending', retry_count = 0, last_error = NULL,
        scheduled_at = NOW(), claimed_at = NULL, claimed_by = NULL, updated_at = NOW()
    WHERE lead_id = $1 AND status = 'failed'
  `, [id])
  for (const d of failed) {
    await enqueue({ type: 'delivery.dispatch', payload: { delivery_id: d.id } })
  }
  return { ok: true, retried: failed.length }
})
```

- [ ] **Step 3: Export CSV**

```ts
// server/api/leads/export.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

function esc(v: any): string {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event) as Record<string, string>
  const conds: string[] = ['deleted_at IS NULL']
  const params: any[] = []
  if (q.client_id) { params.push(q.client_id); conds.push(`client_id = $${params.length}`) }
  if (q.source) { params.push(q.source); conds.push(`source = $${params.length}`) }
  if (q.form_id) { params.push(q.form_id); conds.push(`form_id = $${params.length}`) }
  if (q.status) { params.push(q.status); conds.push(`status = $${params.length}`) }
  if (q.from) { params.push(q.from); conds.push(`submitted_at >= $${params.length}`) }
  if (q.to) { params.push(q.to); conds.push(`submitted_at <= $${params.length}`) }
  const rows = await queryRows<any>(`
    SELECT submitted_at, source, form_name, status, assigned_to, client_id, field_data, attribution
    FROM leads WHERE ${conds.join(' AND ')}
    ORDER BY submitted_at DESC LIMIT 5000
  `, params)
  const header = ['submitted_at','source','form_name','status','assigned_to','client_id','field_data','attribution']
  const lines = [header.join(',')]
  for (const r of rows) lines.push(header.map(h => esc(r[h])).join(','))
  setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0,10)}.csv"`)
  return lines.join('\n')
})
```

- [ ] **Step 4: SSE stream**

```ts
// server/api/leads/stream.get.ts
// Per-user SSE keep-alive. The producer (ingestion endpoint) writes a row to
// a tiny pub/sub via Postgres LISTEN/NOTIFY OR simpler v1: poll every 5s.
// For v1 we poll — it's fine for inbox-level latency.

import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache, no-transform')
  setResponseHeader(event, 'Connection', 'keep-alive')

  const res = event.node.res
  let lastIso = new Date(Date.now() - 5_000).toISOString()
  const send = (e: string, data: any) => {
    res.write(`event: ${e}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  send('hello', { ts: new Date().toISOString() })

  const interval = setInterval(async () => {
    try {
      const rows = await queryRows<{ id: string; submitted_at: string; client_id: string | null; source: string }>(
        `SELECT id, submitted_at, client_id, source FROM leads
         WHERE ingested_at > $1 AND deleted_at IS NULL
         ORDER BY ingested_at ASC LIMIT 50`, [lastIso],
      )
      if (rows.length) {
        lastIso = new Date(Date.now()).toISOString()
        for (const r of rows) send('lead', r)
      } else {
        send('ping', { ts: new Date().toISOString() })
      }
    } catch (e: any) {
      send('error', { error: e?.message ?? String(e) })
    }
  }, 5_000)

  event.node.req.on('close', () => clearInterval(interval))
  // Hold the connection open; H3 will not auto-close because we never return.
  return new Promise(() => {})
})
```

- [ ] **Step 5: Commit**

```bash
git add server/api/leads/[id]/purge.delete.ts server/api/leads/[id]/retry.post.ts \
        server/api/leads/export.get.ts server/api/leads/stream.get.ts
git commit -m "feat(leads): purge, retry, CSV export, SSE stream endpoints"
```

---

## Section I — Rules + endpoints + forms API

### Task 28: Rules endpoints

**Files:**
- Create: `server/api/leads/rules/list.get.ts`
- Create: `server/api/leads/rules/[ruleId].get.ts`
- Create: `server/api/leads/rules/[ruleId].patch.ts`
- Create: `server/api/leads/rules/[ruleId]/destinations.post.ts`
- Create: `server/api/leads/rules/[ruleId]/destinations/[destId].put.ts`
- Create: `server/api/leads/rules/[ruleId]/destinations/[destId].delete.ts`

- [ ] **Step 1: List**

```ts
// server/api/leads/rules/list.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  // (client_id × form_id) combinations: union rules + observed metadata
  const rows = await queryRows(`
    SELECT
      m.source, m.form_id, m.form_name,
      r.id AS rule_id, r.client_id, r.enabled, r.updated_at,
      m.last_lead_at,
      (SELECT COUNT(*) FROM lead_rule_destinations d WHERE d.rule_id = r.id) AS destination_count
    FROM lead_form_metadata m
    LEFT JOIN lead_form_rules r ON r.source = m.source AND r.form_id = m.form_id
    ORDER BY m.last_lead_at DESC NULLS LAST
  `)
  return { items: rows }
})
```

- [ ] **Step 2: Get one**

```ts
// server/api/leads/rules/[ruleId].get.ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const ruleId = getRouterParam(event, 'ruleId')!
  const rule = await queryOne(`SELECT * FROM lead_form_rules WHERE id = $1`, [ruleId])
  if (!rule) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  const destinations = await queryRows(
    `SELECT * FROM lead_rule_destinations WHERE rule_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [ruleId],
  )
  return { rule, destinations }
})
```

- [ ] **Step 3: Patch rule (toggle enabled / rename)**

```ts
// server/api/leads/rules/[ruleId].patch.ts
import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

const Body = z.object({
  enabled: z.boolean().optional(),
  form_name: z.string().optional(),
})
export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const ruleId = getRouterParam(event, 'ruleId')!
  const b = Body.parse(await readBody(event))
  const sets: string[] = []
  const params: any[] = []
  if ('enabled' in b) { params.push(b.enabled); sets.push(`enabled = $${params.length}`) }
  if ('form_name' in b) { params.push(b.form_name); sets.push(`form_name = $${params.length}`) }
  if (!sets.length) return { ok: true }
  params.push(ruleId)
  await execute(`UPDATE lead_form_rules SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
  return { ok: true }
})
```

- [ ] **Step 4: Add destination**

```ts
// server/api/leads/rules/[ruleId]/destinations.post.ts
import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'
import { getAdapter } from '~~/server/utils/leads/destinations'

const Body = z.object({
  destination_type: z.string(),
  config: z.any(),
  filter: z.any().nullable().optional(),
  delay_minutes: z.number().int().min(0).max(1440).default(0),
  enabled: z.boolean().default(true),
  sort_order: z.number().int().default(0),
})

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const ruleId = getRouterParam(event, 'ruleId')!
  const b = Body.parse(await readBody(event))
  const adapter = getAdapter(b.destination_type)
  if (!adapter) throw createError({ statusCode: 400, statusMessage: 'unknown_type' })
  const v = adapter.validateConfig(b.config)
  if (!v.valid) throw createError({ statusCode: 400, statusMessage: 'invalid_config', data: v.errors })
  const row = await queryOne<{ id: string }>(`
    INSERT INTO lead_rule_destinations
      (rule_id, destination_type, config, filter, delay_minutes, enabled, sort_order)
    VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
    RETURNING id
  `, [ruleId, b.destination_type, JSON.stringify(b.config),
      b.filter ? JSON.stringify(b.filter) : null,
      b.delay_minutes, b.enabled, b.sort_order])
  return { ok: true, id: row!.id }
})
```

- [ ] **Step 5: Update destination**

```ts
// server/api/leads/rules/[ruleId]/destinations/[destId].put.ts
import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'
import { getAdapter } from '~~/server/utils/leads/destinations'

const Body = z.object({
  destination_type: z.string(),
  config: z.any(),
  filter: z.any().nullable().optional(),
  delay_minutes: z.number().int().min(0).max(1440),
  enabled: z.boolean(),
  sort_order: z.number().int(),
})

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const destId = getRouterParam(event, 'destId')!
  const b = Body.parse(await readBody(event))
  const adapter = getAdapter(b.destination_type)
  if (!adapter) throw createError({ statusCode: 400, statusMessage: 'unknown_type' })
  const v = adapter.validateConfig(b.config)
  if (!v.valid) throw createError({ statusCode: 400, statusMessage: 'invalid_config', data: v.errors })
  await execute(`
    UPDATE lead_rule_destinations
    SET destination_type = $2, config = $3::jsonb, filter = $4::jsonb,
        delay_minutes = $5, enabled = $6, sort_order = $7, updated_at = NOW()
    WHERE id = $1
  `, [destId, b.destination_type, JSON.stringify(b.config),
      b.filter ? JSON.stringify(b.filter) : null,
      b.delay_minutes, b.enabled, b.sort_order])
  return { ok: true }
})
```

- [ ] **Step 6: Delete destination**

```ts
// server/api/leads/rules/[ruleId]/destinations/[destId].delete.ts
import { requireRole } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const destId = getRouterParam(event, 'destId')!
  const n = await execute(`DELETE FROM lead_rule_destinations WHERE id = $1`, [destId])
  if (!n) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { ok: true }
})
```

- [ ] **Step 7: Commit**

```bash
git add server/api/leads/rules
git commit -m "feat(leads): rule + destination CRUD endpoints"
```

---

### Task 29: Test-fire endpoint

**Files:**
- Create: `server/api/leads/rules/[ruleId]/test-fire.post.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/leads/rules/[ruleId]/test-fire.post.ts
// Synthesizes a sample lead from form metadata, runs filter eval per destination,
// and dispatches via the adapter — but does NOT persist anything.

import { requireRole } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { evaluateFilter } from '~~/server/utils/leads/filterEval'
import { getAdapter } from '~~/server/utils/leads/destinations'
import { deliveryIdempotencyKey } from '~~/server/utils/leads/idempotency'
import type { Lead, LeadDelivery } from '~~/app/types'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const ruleId = getRouterParam(event, 'ruleId')!
  const overrides = (await readBody(event)) as { field_data?: Record<string, string> } | null

  const rule: any = await queryOne(`SELECT * FROM lead_form_rules WHERE id = $1`, [ruleId])
  if (!rule) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  const meta: any = await queryOne(
    `SELECT * FROM lead_form_metadata WHERE source = $1 AND form_id = $2`,
    [rule.source, rule.form_id],
  )
  const sampleFields: Record<string, string> = {}
  for (const f of (meta?.fields ?? [])) {
    if (f.sample_value) sampleFields[f.key] = f.sample_value
  }
  const fakeLead: Lead = {
    id: 'TEST-LEAD',
    client_id: rule.client_id,
    source: rule.source,
    source_lead_id: 'test-fire',
    form_id: rule.form_id, form_name: rule.form_name,
    ad_id: null, ad_name: null, campaign_id: null, campaign_name: null,
    page_id: null,
    submitted_at: new Date().toISOString(), ingested_at: new Date().toISOString(),
    field_data: { ...sampleFields, ...(overrides?.field_data ?? {}) },
    attribution: null, score: null, score_reasons: null, status: 'new',
    spam_reasons: null, assigned_to: null, contacted_at: null, contacted_by: null,
    notes: null, created_by: null, deleted_at: null,
    created_at: new Date().toISOString(),
  }

  const destinations: any[] = await queryRows(
    `SELECT * FROM lead_rule_destinations WHERE rule_id = $1 ORDER BY sort_order`, [ruleId],
  )
  const results: any[] = []
  for (const d of destinations) {
    if (!d.enabled) { results.push({ id: d.id, skipped: 'disabled' }); continue }
    if (!evaluateFilter(fakeLead, d.filter)) { results.push({ id: d.id, skipped: 'filter' }); continue }
    const adapter = getAdapter(d.destination_type)
    if (!adapter) { results.push({ id: d.id, skipped: 'unknown_type' }); continue }
    const fakeDelivery: LeadDelivery = {
      id: 'TEST-DELIVERY', lead_id: fakeLead.id, rule_destination_id: d.id,
      destination_type: d.destination_type, status: 'claimed',
      scheduled_at: new Date().toISOString(), claimed_at: new Date().toISOString(),
      claimed_by: 'test', attempted_at: null, last_error: null, retry_count: 0,
      response_meta: null, idempotency_key: deliveryIdempotencyKey('TEST-LEAD', d.id),
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    const r = await adapter.dispatch(fakeDelivery, fakeLead, d.config)
    results.push({ id: d.id, type: d.destination_type, ...r })
  }
  return { ok: true, lead_used: fakeLead, results }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/api/leads/rules/[ruleId]/test-fire.post.ts
git commit -m "feat(leads): rule test-fire — synthesizes lead and dispatches without persisting"
```

---

### Task 30: Endpoints (URL+key) management

**Files:**
- Create: `server/api/leads/endpoints/list.get.ts`
- Create: `server/api/leads/endpoints/[id]/rotate.post.ts`
- Create: `server/api/leads/forms/list.get.ts`

- [ ] **Step 1: List endpoints**

```ts
// server/api/leads/endpoints/list.get.ts
// One row per client. Auto-creates on first read so the UI is always populated.
import { randomBytes, randomUUID } from 'node:crypto'
import { requireAuth } from '~~/server/utils/auth'
import { execute, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  // Backfill: ensure every active client has a 'google' endpoint row
  await execute(`
    INSERT INTO lead_webhook_endpoints (client_id, source, url_token, secret_key)
    SELECT c.id, 'google', encode(gen_random_bytes(18), 'hex'), encode(gen_random_bytes(24), 'hex')
    FROM agency_clients c
    WHERE NOT EXISTS (
      SELECT 1 FROM lead_webhook_endpoints e
      WHERE e.client_id = c.id AND e.source = 'google'
    )
  `)
  const rows = await queryRows(`
    SELECT e.id, e.client_id, c.name AS client_name,
           e.url_token, e.secret_key, e.secret_key_grace_until, e.rotated_at,
           (SELECT COUNT(*) FROM leads l WHERE l.source = 'google' AND l.client_id = e.client_id AND l.deleted_at IS NULL) AS lead_count
    FROM lead_webhook_endpoints e
    JOIN agency_clients c ON c.id = e.client_id
    WHERE e.source = 'google'
    ORDER BY c.name ASC
  `)
  return { items: rows }
})
```

- [ ] **Step 2: Rotate key**

```ts
// server/api/leads/endpoints/[id]/rotate.post.ts
import { randomBytes } from 'node:crypto'
import { requireRole } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const id = getRouterParam(event, 'id')!
  const newKey = randomBytes(24).toString('hex')
  await execute(`
    UPDATE lead_webhook_endpoints
    SET secret_key_previous = secret_key,
        secret_key = $2,
        secret_key_grace_until = NOW() + INTERVAL '30 minutes',
        rotated_at = NOW()
    WHERE id = $1
  `, [id, newKey])
  return { ok: true, secret_key: newKey, grace_minutes: 30 }
})
```

- [ ] **Step 3: Forms list**

```ts
// server/api/leads/forms/list.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { listFormMetadata } from '~~/server/utils/leads/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  return { items: await listFormMetadata() }
})
```

- [ ] **Step 4: Commit**

```bash
git add server/api/leads/endpoints server/api/leads/forms
git commit -m "feat(leads): endpoint URL/key management + form-metadata listing"
```

---

### Task 31: Dev replay endpoint (gated)

**Files:**
- Create: `server/api/leads/dev/replay/[errorId].post.ts`

- [ ] **Step 1: Implement**

```ts
// server/api/leads/dev/replay/[errorId].post.ts
// Dev-environment only. Refeeds a stored ingestion error through the pipeline.
import { requireRole } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 403, statusMessage: 'disabled_in_prod' })
  }
  await requireRole(event, ['owner', 'admin'])
  const id = getRouterParam(event, 'errorId')!
  const row = await queryOne<{ source: string; raw_payload: any }>(
    `SELECT source, raw_payload FROM lead_ingestion_errors WHERE id = $1`, [id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  // Replay only Google for v1
  if (row.source !== 'google') throw createError({ statusCode: 400, statusMessage: 'meta_replay_in_phase_2' })
  return { ok: true, replay_payload: row.raw_payload }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/api/leads/dev/replay/[errorId].post.ts
git commit -m "feat(leads): dev-only replay endpoint for ingestion errors"
```

---

## Section J — Client portal API

### Task 32: Portal — list, detail, contacted, export

**Files:**
- Create: `server/api/client-portal/leads/list.get.ts`
- Create: `server/api/client-portal/leads/[id].get.ts`
- Create: `server/api/client-portal/leads/[id]/contacted.post.ts`
- Create: `server/api/client-portal/leads/export.get.ts`

- [ ] **Step 1: Client list (filtered to client + portal-visible only)**

```ts
// server/api/client-portal/leads/list.get.ts
// Visibility rule: client portal sees a lead iff at least one of the form's
// destinations is type='portal' AND enabled. Joining at read time keeps the
// model simple (no `portal_visible` column to keep in sync).
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows, queryCount } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = getQuery(event) as Record<string, string>
  const conds = [
    'l.deleted_at IS NULL',
    'l.client_id = $1',
    `EXISTS (
      SELECT 1 FROM lead_form_rules r
      JOIN lead_rule_destinations d ON d.rule_id = r.id
      WHERE r.source = l.source AND r.form_id = l.form_id
        AND d.destination_type = 'portal' AND d.enabled = TRUE
    )`,
  ]
  const params: any[] = [client.client_id]
  if (q.status) { params.push(q.status); conds.push(`l.status = $${params.length}`) }
  if (q.from) { params.push(q.from); conds.push(`l.submitted_at >= $${params.length}`) }
  if (q.to) { params.push(q.to); conds.push(`l.submitted_at <= $${params.length}`) }
  const page = Math.max(1, parseInt(q.page ?? '1'))
  const ps = Math.min(200, Math.max(1, parseInt(q.page_size ?? '50')))
  const offset = (page - 1) * ps
  const items = await queryRows(`
    SELECT l.id, l.source, l.form_name, l.submitted_at, l.field_data, l.status, l.contacted_at
    FROM leads l WHERE ${conds.join(' AND ')}
    ORDER BY l.submitted_at DESC
    LIMIT ${ps} OFFSET ${offset}
  `, params)
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM leads l WHERE ${conds.join(' AND ')}`, params)
  return { items, total, page, page_size: ps }
})
```

- [ ] **Step 2: Client detail**

```ts
// server/api/client-portal/leads/[id].get.ts
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const lead = await queryOne(`
    SELECT l.id, l.source, l.form_name, l.submitted_at, l.field_data, l.attribution, l.status, l.contacted_at
    FROM leads l
    WHERE l.id = $1 AND l.client_id = $2 AND l.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM lead_form_rules r
        JOIN lead_rule_destinations d ON d.rule_id = r.id
        WHERE r.source = l.source AND r.form_id = l.form_id
          AND d.destination_type = 'portal' AND d.enabled = TRUE
      )
  `, [id, client.client_id])
  if (!lead) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { lead }
})
```

- [ ] **Step 3: Mark contacted**

```ts
// server/api/client-portal/leads/[id]/contacted.post.ts
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const n = await execute(`
    UPDATE leads SET status = 'contacted', contacted_at = NOW()
    WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL AND status = 'new'
  `, [id, client.client_id])
  if (!n) throw createError({ statusCode: 404, statusMessage: 'not_updatable' })
  return { ok: true }
})
```

- [ ] **Step 4: CSV export**

```ts
// server/api/client-portal/leads/export.get.ts
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'

function esc(v: any): string {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const rows = await queryRows<any>(`
    SELECT l.submitted_at, l.source, l.form_name, l.status, l.field_data
    FROM leads l WHERE l.client_id = $1 AND l.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM lead_form_rules r
        JOIN lead_rule_destinations d ON d.rule_id = r.id
        WHERE r.source = l.source AND r.form_id = l.form_id
          AND d.destination_type = 'portal' AND d.enabled = TRUE
      )
    ORDER BY l.submitted_at DESC LIMIT 5000
  `, [client.client_id])
  const header = ['submitted_at','source','form_name','status','field_data']
  const lines = [header.join(','), ...rows.map(r => header.map(h => esc(r[h])).join(','))]
  setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="my-leads-${new Date().toISOString().slice(0,10)}.csv"`)
  return lines.join('\n')
})
```

- [ ] **Step 5: Commit**

```bash
git add server/api/client-portal/leads
git commit -m "feat(leads): client portal API — list, detail, contacted, export"
```

---

## Section K — Verification & smoke

### Task 33: Backend smoke checklist

- [ ] **Step 1: Apply migration on dev DB**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/084-leads-engine.sql
```

- [ ] **Step 2: Run all unit + integration tests**

```bash
pnpm vitest run test/server/utils/leads test/server/api/leads
```

Expected: all green.

- [ ] **Step 3: Start dev server, hit health probe**

```bash
pnpm dev &
sleep 8
# Get any client_id from the DB, then hit endpoints to seed an endpoint row
curl -s http://localhost:3000/api/leads/endpoints/list | jq '.items[0]'
```

Expected: a JSON object with `url_token`, `secret_key`.

- [ ] **Step 4: Send a synthetic Google payload**

Replace `<TOKEN>` and `<KEY>` from step 3:

```bash
curl -s -X POST http://localhost:3000/api/leads/webhook/google/<TOKEN> \
  -H 'Content-Type: application/json' \
  -d '{
    "google_key": "<KEY>",
    "lead_id": "smoke-1",
    "form_id": "smoke-form",
    "campaign_id": "C100",
    "user_column_data": [
      {"column_name": "EMAIL", "string_value": "smoke@adme.net.au"},
      {"column_name": "FULL_NAME", "string_value": "Smoke Test"}
    ]
  }'
```

Expected: `{"ok":true,"lead_id":"<uuid>"}`.

- [ ] **Step 5: Confirm lead landed**

```bash
psql "$DATABASE_URL" -c "SELECT id, source, form_id, field_data, assigned_to FROM leads WHERE source_lead_id = 'smoke-1';"
```

Expected: 1 row with field_data containing email + full_name.

- [ ] **Step 6: Confirm dedup**

Re-run the curl from step 4. Expected: `{"ok":true,"skipped":true}` and no new row in DB.

- [ ] **Step 7: Tag the milestone**

```bash
git tag -a leads-1a-backend -m "Phase 1a backend complete — Google ingestion + agency/portal API"
```

---

## Spec coverage check

Mapping back to Phase 1 acceptance criteria from the spec:

| Phase 1 acceptance item | Task(s) |
|---|---|
| Migration `084-leads-engine.sql` applied | 1 |
| Google webhook accepts/verifies/dedupes/inserts/enqueues | 23 |
| Inbound rate limit 429 with Retry-After | 7, 23 |
| Manual lead entry endpoint | 24 |
| Form metadata upserted; rule-editor field dropdown source | 23, 30 |
| Auto-assignment via client_team_assignments | 9, 23, 24 |
| Rules engine fans out with filters and delays | 10 |
| 6 destinations dispatch | 13–18 |
| `validateConfig` blocks invalid configs | 14, 16, 17 (representative) |
| CF Queue consumer claim-locks, re-validates, retries 1m/5m/15m, fails after 3 | 19, 20 |
| Stuck-claim recovery cron | 21 |
| Outbound webhooks include `X-Leads-Idempotency-Key` + `X-Leads-Signature` | 14 |
| Settings → Google "Lead webhooks" — URL+key + rotation grace | 30 |
| Soft + hard delete (purge), retry, CSV export, SSE | 26, 27 |
| `lead_ingestion_errors` 30-day purge cron target | 21 (recovery) — purge cron lives in Plan 1c |
| Test-fire button | 29 |

**Items deferred to Plan 1b (UI):** Inbox, Form Rules editor, slide-over, manual modal, filter builder, settings tab, portal page.
**Items deferred to Plan 1c (ops):** Worker deploy + queue consumer wiring, cron schedules (purge, recovery, retention), notification on new lead via Smart Watch, marketing site sync, load test.

---

**Plan 1a complete. Plans 1b (UI) and 1c (ops + verification) follow.**
