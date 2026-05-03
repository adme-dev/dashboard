-- Migration 092: Xero customer cache + rollup tables
--
-- Foundation for the customer-hub overhaul. Stops the customers UI from
-- hitting Xero on every page load and unlocks per-row aging, lifetime
-- revenue, DSO and concentration without recomputing on read.
--
-- Three tables:
--  1. xero_contacts_cache   — mirror of Xero ACTIVE contacts, refreshed by cron
--  2. xero_invoices_cache   — full ACCREC + ACCPAY history, refreshed by cron
--  3. xero_customer_rollups — pre-computed per-customer metrics powering cards
--
-- All money is stored as BIGINT cents in the contact's native currency.
-- Conversion to AUD happens at display time so we never lose fx accuracy.
-- Composite PK on (tenant_id, contact_id) keeps the door open for multi-Xero
-- installs even though xero_org_connection currently enforces single-tenant.

-- ─── Contacts cache ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS xero_contacts_cache (
  tenant_id          TEXT      NOT NULL,
  contact_id         TEXT      NOT NULL,
  name               TEXT      NOT NULL,
  contact_number     TEXT,
  account_number     TEXT,
  status             TEXT      NOT NULL DEFAULT 'ACTIVE',
  is_customer        BOOLEAN   NOT NULL DEFAULT false,
  is_supplier        BOOLEAN   NOT NULL DEFAULT false,
  email              TEXT,
  phone              TEXT,
  website            TEXT,
  tax_number         TEXT,
  default_currency   TEXT,

  -- Payment terms (sales side — what they owe us)
  payment_terms_days INT,
  payment_terms_type TEXT,  -- DAYSAFTERBILLDATE | DAYSAFTERBILLMONTH | OFFOLLOWINGMONTH

  -- Primary STREET/PO address (or first available)
  address_line1      TEXT,
  address_line2      TEXT,
  city               TEXT,
  region             TEXT,
  postal_code        TEXT,
  country            TEXT,

  -- Live balances from Xero (cents, native currency).
  -- Authoritative source for "outstanding right now" — rollups
  -- denormalize these for sortability but the contact cache is truth.
  receivable_outstanding_cents BIGINT NOT NULL DEFAULT 0,
  receivable_overdue_cents     BIGINT NOT NULL DEFAULT 0,
  payable_outstanding_cents    BIGINT NOT NULL DEFAULT 0,
  payable_overdue_cents        BIGINT NOT NULL DEFAULT 0,

  -- Sync metadata
  xero_updated_at TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, contact_id)
);

-- Sortable name search per tenant
CREATE INDEX IF NOT EXISTS idx_xcc_name
  ON xero_contacts_cache(tenant_id, name);

-- Customers-only fast scan (most pages filter to is_customer)
CREATE INDEX IF NOT EXISTS idx_xcc_customer
  ON xero_contacts_cache(tenant_id, name)
  WHERE is_customer;

-- Suppliers-only fast scan
CREATE INDEX IF NOT EXISTS idx_xcc_supplier
  ON xero_contacts_cache(tenant_id, name)
  WHERE is_supplier;


-- ─── Invoices cache ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS xero_invoices_cache (
  tenant_id          TEXT      NOT NULL,
  invoice_id         TEXT      NOT NULL,
  contact_id         TEXT      NOT NULL,
  invoice_number     TEXT,
  reference          TEXT,
  type               TEXT      NOT NULL,  -- ACCREC | ACCPAY
  status             TEXT      NOT NULL,  -- DRAFT|SUBMITTED|AUTHORISED|PAID|VOIDED|DELETED

  date                DATE     NOT NULL,
  due_date            DATE,
  fully_paid_on_date  DATE,

  currency_code         TEXT,
  subtotal_cents        BIGINT NOT NULL DEFAULT 0,
  total_tax_cents       BIGINT NOT NULL DEFAULT 0,
  total_cents           BIGINT NOT NULL DEFAULT 0,
  amount_paid_cents     BIGINT NOT NULL DEFAULT 0,
  amount_due_cents      BIGINT NOT NULL DEFAULT 0,
  amount_credited_cents BIGINT NOT NULL DEFAULT 0,

  xero_updated_at TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, invoice_id)
);

-- Per-contact history (the hot path: one customer's invoices)
CREATE INDEX IF NOT EXISTS idx_xic_contact
  ON xero_invoices_cache(tenant_id, contact_id, date DESC);

-- AR aging scans + filtered by status
CREATE INDEX IF NOT EXISTS idx_xic_type_status
  ON xero_invoices_cache(tenant_id, type, status);

-- Outstanding-only fast scan for aging recompute
CREATE INDEX IF NOT EXISTS idx_xic_outstanding
  ON xero_invoices_cache(tenant_id, contact_id, due_date)
  WHERE type = 'ACCREC' AND status = 'AUTHORISED' AND amount_due_cents > 0;

-- Recent-paid scan for DSO calculation
CREATE INDEX IF NOT EXISTS idx_xic_paid
  ON xero_invoices_cache(tenant_id, contact_id, fully_paid_on_date DESC)
  WHERE type = 'ACCREC' AND status = 'PAID';


-- ─── Customer rollups ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS xero_customer_rollups (
  tenant_id   TEXT NOT NULL,
  contact_id  TEXT NOT NULL,

  -- Tenure / activity dates
  first_invoice_date  DATE,
  last_invoice_date   DATE,
  last_payment_date   DATE,

  -- Lifetime + period revenue (cents, native currency from contact)
  ltv_cents              BIGINT NOT NULL DEFAULT 0,
  ytd_revenue_cents      BIGINT NOT NULL DEFAULT 0,
  last_12m_revenue_cents BIGINT NOT NULL DEFAULT 0,

  -- Monthly buckets for sparkline. JSONB array of 12 entries:
  -- [{ "month": "2025-04", "cents": 12345 }, ... ] oldest → newest
  last_12m_buckets JSONB NOT NULL DEFAULT '[]'::jsonb,

  invoice_count       INT NOT NULL DEFAULT 0,
  paid_invoice_count  INT NOT NULL DEFAULT 0,
  avg_invoice_cents   BIGINT NOT NULL DEFAULT 0,

  -- Payment behaviour (last N=10 PAID invoices)
  dso_days        NUMERIC(6,2),  -- mean (fully_paid_on_date - date)
  paid_late_pct   NUMERIC(5,2),  -- % of last N PAID that were late vs payment terms

  -- Aging snapshot (matches /api/xero/reports/aging buckets)
  outstanding_cents    BIGINT NOT NULL DEFAULT 0,
  overdue_cents        BIGINT NOT NULL DEFAULT 0,
  oldest_overdue_days  INT    NOT NULL DEFAULT 0,
  -- { "current": cents, "1-30": cents, "31-60": cents, "61-90": cents, "90+": cents }
  aging_buckets        JSONB  NOT NULL DEFAULT '{}'::jsonb,

  -- Recurring revenue (from Xero repeating invoices)
  mrr_cents             BIGINT NOT NULL DEFAULT 0,
  has_active_repeating  BOOLEAN NOT NULL DEFAULT false,

  -- Concentration: this contact's share of agency YTD revenue (0-100)
  concentration_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,

  currency_code  TEXT,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, contact_id)
);

-- Top-N queries: sort by LTV / YTD / overdue
CREATE INDEX IF NOT EXISTS idx_xcr_ltv
  ON xero_customer_rollups(tenant_id, ltv_cents DESC);

CREATE INDEX IF NOT EXISTS idx_xcr_ytd
  ON xero_customer_rollups(tenant_id, ytd_revenue_cents DESC);

CREATE INDEX IF NOT EXISTS idx_xcr_overdue
  ON xero_customer_rollups(tenant_id, overdue_cents DESC)
  WHERE overdue_cents > 0;

-- Concentration risk dashboard
CREATE INDEX IF NOT EXISTS idx_xcr_concentration
  ON xero_customer_rollups(tenant_id, concentration_pct DESC)
  WHERE concentration_pct >= 5;
