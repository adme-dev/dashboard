-- 288: Commitment register for the cash forecasting layer.
--
-- Holds forecast-only payment commitments that are NOT yet Xero accounting
-- documents: bills expected but not received, held/disputed payments, and
-- recurring obligations awaiting invoices. Mirrors the enterprise cash
-- forecasting recommendation (Aug 2026): Xero owns accounting truth,
-- XeroFlow owns forecast intelligence. A commitment must never become a
-- fake Xero bill — when the real bill syncs in, matching logic sets
-- matched_invoice_id and the commitment stops contributing to the forecast.

CREATE TABLE IF NOT EXISTS cashflow_commitments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          TEXT NOT NULL,
  supplier           TEXT NOT NULL,
  contact_id         TEXT,            -- optional link to xero_contacts_cache for matching
  description        TEXT,
  amount_cents       BIGINT NOT NULL CHECK (amount_cents > 0),
  expected_date      DATE NOT NULL,   -- when cash is expected to leave the account
  recurrence         TEXT NOT NULL DEFAULT 'none'
                     CHECK (recurrence IN ('none','weekly','fortnightly','monthly','quarterly','yearly')),
  recurrence_end     DATE,
  payment_account    TEXT NOT NULL DEFAULT 'NAB_BUSINESS'
                     CHECK (payment_account IN ('NAB_BUSINESS','NAB_TAX','AMEX')),
  status             TEXT NOT NULL DEFAULT 'expected'
                     CHECK (status IN ('expected','hold','disputed','matched','closed')),
  confidence         TEXT NOT NULL DEFAULT 'probable'
                     CHECK (confidence IN ('committed','probable','provisional')),
  owner              TEXT,            -- accountable person (free text; e.g. Kellie)
  notes              TEXT,
  source             TEXT NOT NULL DEFAULT 'manual'
                     CHECK (source IN ('manual','spreadsheet-import')),
  matched_invoice_id TEXT,            -- xero_invoices_cache.invoice_id once superseded
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashflow_commitments_tenant_date
  ON cashflow_commitments (tenant_id, expected_date);
CREATE INDEX IF NOT EXISTS idx_cashflow_commitments_tenant_status
  ON cashflow_commitments (tenant_id, status);
