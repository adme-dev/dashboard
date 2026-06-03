-- 161 — Xero invoice LINE-ITEM cache (both ACCREC revenue and ACCPAY cost)
--
-- The header cache (xero_invoices_cache, mig 092) stores invoice totals only.
-- Accurate Agency Gross Income (revenue − actual media cost) needs per-line
-- detail: account code, tracking (Media/Client), and ex-GST/GST — for BOTH
-- sides of the ledger. ACCPAY (vendor bills / cost) was never synced before.
--
-- Denormalises invoice date/status/type/contact onto each line so margin
-- queries don't need to join back to the header cache.

CREATE TABLE IF NOT EXISTS xero_invoice_lines_cache (
  tenant_id          TEXT      NOT NULL,
  invoice_id         TEXT      NOT NULL,   -- Xero InvoiceID
  line_item_id       TEXT      NOT NULL,   -- Xero LineItemID (or invoiceId:idx fallback)

  account_code       TEXT,
  tax_type           TEXT,
  description        TEXT,
  quantity           NUMERIC(14,4),
  unit_amount_cents  BIGINT    NOT NULL DEFAULT 0,
  line_ex_gst_cents  BIGINT    NOT NULL DEFAULT 0,  -- derived via LineAmountTypes
  tax_amount_cents   BIGINT    NOT NULL DEFAULT 0,

  tracking_media     TEXT,     -- 'Media' tracking option (Facebook Ads, TV - Seven, …)
  tracking_client    TEXT,     -- 'Client' tracking option

  invoice_date       DATE      NOT NULL,
  invoice_status     TEXT      NOT NULL,
  invoice_type       TEXT      NOT NULL,  -- ACCREC (revenue) | ACCPAY (cost)
  contact_name       TEXT,

  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, line_item_id)
);

-- Month scans (AGI per period)
CREATE INDEX IF NOT EXISTS idx_xilc_date
  ON xero_invoice_lines_cache(tenant_id, invoice_date);

-- Revenue/cost split by period
CREATE INDEX IF NOT EXISTS idx_xilc_type_date
  ON xero_invoice_lines_cache(tenant_id, invoice_type, invoice_date);

-- Classify by account code
CREATE INDEX IF NOT EXISTS idx_xilc_code
  ON xero_invoice_lines_cache(tenant_id, account_code);

-- Re-sync: replace all lines for an invoice
CREATE INDEX IF NOT EXISTS idx_xilc_invoice
  ON xero_invoice_lines_cache(tenant_id, invoice_id);
