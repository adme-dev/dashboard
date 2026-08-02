-- ADR-007: Xero landing layer.
--
-- Faithful mirror of Xero entities. Xero's GUID is the natural key, `raw_payload`
-- keeps the untouched response so the domain layer can be rebuilt WITHOUT
-- spending Xero quota, and `xero_updated_utc` drives incremental sync via
-- If-Modified-Since (a full invoice pull is ~19 pages; incremental is typically 0-2).
--
-- Deliberately NOT reshaped: no renaming, no flattening, no filtering. Ugly Xero
-- field names are the point — they make drift obvious. Reshaping at this boundary
-- is what silently broke client embeddings for months (PR #363).
--
-- Additive and idempotent. Creates no read-path dependency: nothing queries these
-- tables until the sync engine and domain transforms land separately.

BEGIN;

-- Invoices (ACCREC + ACCPAY) ------------------------------------------------
CREATE TABLE IF NOT EXISTS xero_raw_invoices (
  xero_id           UUID PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  xero_updated_utc  TIMESTAMPTZ NOT NULL,
  raw_payload       JSONB NOT NULL,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS xero_raw_invoices_tenant_updated_idx
  ON xero_raw_invoices (tenant_id, xero_updated_utc DESC);

-- Contacts ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS xero_raw_contacts (
  xero_id           UUID PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  xero_updated_utc  TIMESTAMPTZ NOT NULL,
  raw_payload       JSONB NOT NULL,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS xero_raw_contacts_tenant_updated_idx
  ON xero_raw_contacts (tenant_id, xero_updated_utc DESC);

-- Accounts (chart of accounts, incl. BANK/CREDITCARD) -----------------------
-- BankAccountType lives in raw_payload; classifying by it rather than by sign
-- is what the 2026-08-02 cash fix depends on (a credit card can hold a
-- positive balance).
CREATE TABLE IF NOT EXISTS xero_raw_accounts (
  xero_id           UUID PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  xero_updated_utc  TIMESTAMPTZ NOT NULL,
  raw_payload       JSONB NOT NULL,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS xero_raw_accounts_tenant_updated_idx
  ON xero_raw_accounts (tenant_id, xero_updated_utc DESC);

-- Bank transactions ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS xero_raw_bank_transactions (
  xero_id           UUID PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  bank_account_id   UUID,
  xero_updated_utc  TIMESTAMPTZ NOT NULL,
  raw_payload       JSONB NOT NULL,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS xero_raw_bank_transactions_tenant_updated_idx
  ON xero_raw_bank_transactions (tenant_id, xero_updated_utc DESC);
CREATE INDEX IF NOT EXISTS xero_raw_bank_transactions_account_idx
  ON xero_raw_bank_transactions (bank_account_id);

-- Credit notes --------------------------------------------------------------
-- Bookkeeper UAT flagged credit notes not being netted from "invoiced";
-- landing them makes that computable from our side.
CREATE TABLE IF NOT EXISTS xero_raw_credit_notes (
  xero_id           UUID PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  xero_updated_utc  TIMESTAMPTZ NOT NULL,
  raw_payload       JSONB NOT NULL,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS xero_raw_credit_notes_tenant_updated_idx
  ON xero_raw_credit_notes (tenant_id, xero_updated_utc DESC);

-- Sync cursor / quota ledger ------------------------------------------------
-- One row per (tenant, entity). `last_updated_utc` is the If-Modified-Since
-- watermark. The error columns exist so a 429 is recorded as data rather than
-- only appearing in logs — today's outage was invisible until queried by hand.
CREATE TABLE IF NOT EXISTS xero_sync_state (
  tenant_id         TEXT NOT NULL,
  entity            TEXT NOT NULL,
  last_updated_utc  TIMESTAMPTZ,
  last_run_at       TIMESTAMPTZ,
  last_status       TEXT,
  last_error        TEXT,
  retry_after_at    TIMESTAMPTZ,
  records_synced    INTEGER NOT NULL DEFAULT 0,
  calls_spent       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, entity)
);

COMMIT;
