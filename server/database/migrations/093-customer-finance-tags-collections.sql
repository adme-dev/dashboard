-- Migration 093: Customer finance, tags, and collections workflow
--
-- Phase C of the customer-hub overhaul. Adds:
--  • customer_finance              — per-customer credit settings + AM
--  • customer_tags / _assignments  — saved segments / labels
--  • customer_collections_log      — record of every chase action
--
-- All keyed on (tenant_id, contact_id) — same shape as the cache/rollup tables.
-- Finance + collections are write-rare / read-often, so no partitioning needed.

-- ─── Customer finance overrides ────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_finance (
  tenant_id          TEXT    NOT NULL,
  contact_id         TEXT    NOT NULL,

  -- Credit control. NULL credit_limit_cents = no agency-imposed limit
  -- (use the contact's natural payment terms instead).
  credit_limit_cents BIGINT,
  credit_hold        BOOLEAN NOT NULL DEFAULT false,
  hold_reason        TEXT,
  -- −1 (low) | 0 (normal) | 1 (high) — used to sort the collections queue.
  payment_priority   SMALLINT NOT NULL DEFAULT 0
    CHECK (payment_priority BETWEEN -1 AND 1),

  -- Free-form notes only visible internally (never sent to the contact)
  internal_notes     TEXT,

  -- Optional account manager assignment
  account_manager_id UUID REFERENCES team_members(id) ON DELETE SET NULL,

  updated_by         UUID REFERENCES team_members(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, contact_id)
);

-- Collections-queue filter
CREATE INDEX IF NOT EXISTS idx_cf_credit_hold
  ON customer_finance(tenant_id) WHERE credit_hold;

CREATE INDEX IF NOT EXISTS idx_cf_account_manager
  ON customer_finance(account_manager_id) WHERE account_manager_id IS NOT NULL;


-- ─── Tag dictionary ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,
  label       TEXT NOT NULL,
  -- Nuxt UI color name: primary | success | warning | error | info | neutral
  color       TEXT NOT NULL DEFAULT 'neutral',
  created_by  UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Tag labels are case-insensitive unique within a tenant — "Strategic"
  -- and "strategic" should not coexist.
  UNIQUE (tenant_id, label)
);

CREATE INDEX IF NOT EXISTS idx_ct_tenant ON customer_tags(tenant_id, label);


-- ─── Tag assignments ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_tag_assignments (
  tenant_id   TEXT NOT NULL,
  contact_id  TEXT NOT NULL,
  tag_id      UUID NOT NULL REFERENCES customer_tags(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_cta_contact ON customer_tag_assignments(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_cta_tag     ON customer_tag_assignments(tag_id);


-- ─── Collections log ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_collections_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,
  contact_id  TEXT NOT NULL,

  -- Action taxonomy. The escalation ladder is gentle → firm → final → handover.
  -- 'note' and 'phone_call' don't escalate but still count as activity for the
  -- "last touched" sort order.
  action      TEXT NOT NULL CHECK (action IN (
    'reminder_gentle',
    'reminder_firm',
    'reminder_final',
    'phone_call',
    'email_custom',
    'escalated_to_handover',
    'note',
    'paid'
  )),

  -- Optional invoice this action targets (FK-less by design — invoices
  -- live in xero_invoices_cache and we don't want to fail an audit-log
  -- write because the cache hasn't been refreshed yet).
  invoice_id  TEXT,
  notes       TEXT,
  created_by  UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ccl_contact_recent
  ON customer_collections_log(tenant_id, contact_id, created_at DESC);

-- "Last touched per contact" lookup — the collections queue uses this
-- to surface "haven't chased in 7 days" filters.
CREATE INDEX IF NOT EXISTS idx_ccl_recent
  ON customer_collections_log(tenant_id, created_at DESC);
