-- Treasury policy layer (spreadsheet retirement W3, Monday board C-12).
--
-- Kellie's cash-management judgment — weekly tax-account transfers with
-- month-varying amounts and skip rules, and Amex statement paydown tranches —
-- cannot be represented in Xero (its cashflow tools exclude transfers and
-- card paydowns entirely). Encoding them as one-off commitment rows proved
-- unmaintainable and, for internal transfers, wrong at org level (a transfer
-- is not an outflow). Policies are edited as config; the Treasury forecast
-- derives dated lines from them at read time.

CREATE TABLE IF NOT EXISTS treasury_policies (
  tenant_id    TEXT NOT NULL,
  policy_type  TEXT NOT NULL CHECK (policy_type IN ('tax_transfer', 'amex_paydown')),
  config       JSONB NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, policy_type)
);
