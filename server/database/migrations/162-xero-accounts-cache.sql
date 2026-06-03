-- 162 — Xero chart-of-accounts cache (code → name + TYPE/CLASS)
--
-- Cost classification must be driven by Xero's own account type, not code
-- ranges: e.g. account 825 ("PAYG Withholdings Payable") sits in ACCPAY spend
-- but is a CURRLIAB settlement, NOT an operating overhead. Storing the type
-- lets AGI/overhead queries classify correctly:
--   DIRECTCOSTS            → cost of sales (nets into AGI)
--   EXPENSE / OVERHEADS    → operating overheads (Get Out target side)
--   CURRLIAB / TERMLIAB    → liability settlements (neither)
--   SALES / REVENUE        → income
--
-- Populated by the invoice-lines sync (one Accounts call per run).

CREATE TABLE IF NOT EXISTS xero_accounts_cache (
  tenant_id   TEXT NOT NULL,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT,          -- DIRECTCOSTS | EXPENSE | OVERHEADS | SALES | CURRLIAB | TERMLIAB | …
  class       TEXT,          -- ASSET | EQUITY | EXPENSE | LIABILITY | REVENUE
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_xac_type ON xero_accounts_cache(tenant_id, type);
