-- Migration 096: Inferred MRR for retainer-style billing
--
-- Many agencies bill retainers as manually re-issued monthly invoices rather
-- than as Xero RepeatingInvoices. Without this, the CFO/Get Out dashboards
-- see "0 schedules" and incorrectly flag the pipeline as critical even when
-- a stable monthly book is right there in the invoice history.
--
-- We detect that pattern post-rollup: per contact, look at invoice cadence
-- over the last 6 months, score regularity, and store an inferred monthly
-- amount with a confidence level. Cards downstream can treat
-- "xero_repeating + inferred_high/medium" as recurring revenue.

ALTER TABLE xero_customer_rollups
  ADD COLUMN IF NOT EXISTS inferred_mrr_cents      BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inferred_mrr_confidence TEXT   NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS inferred_active_months  INT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurring_basis         TEXT   NOT NULL DEFAULT 'none';

-- Confidence values: 'none' | 'low' | 'medium' | 'high'
-- Basis values:      'xero_repeating' (schedule exists)
--                  | 'inferred_high'  (5+ months, CV < 0.2)
--                  | 'inferred_medium'(4+ months, CV < 0.4)
--                  | 'inferred_low'   (3+ months)
--                  | 'none'

-- Top-N recurring revenue queries
CREATE INDEX IF NOT EXISTS idx_xcr_inferred_mrr
  ON xero_customer_rollups(tenant_id, inferred_mrr_cents DESC)
  WHERE inferred_mrr_cents > 0;
