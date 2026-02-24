-- ============================================
-- Migration 006: EOM Invoicing Tables
-- ============================================
-- End-of-month invoice generation tracking.
-- eom_runs = one generation per month
-- eom_line_items = individual invoice line items within a run

-- EOM generation runs
CREATE TABLE IF NOT EXISTS eom_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'review', 'pushed', 'complete', 'failed')),
  total_ex_gst DECIMAL(12,2),
  total_gst DECIMAL(12,2),
  invoice_count INTEGER DEFAULT 0,
  line_item_count INTEGER DEFAULT 0,
  flagged_count INTEGER DEFAULT 0,
  first_invoice_number INTEGER,
  last_invoice_number INTEGER,
  xero_batch_id TEXT,
  notes TEXT,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, year)
);

-- Individual invoice line items
CREATE TABLE IF NOT EXISTS eom_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES eom_runs(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_code VARCHAR(20),
  monday_item_id TEXT,
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_amount DECIMAL(12,2) NOT NULL,
  account_code VARCHAR(10) NOT NULL,
  tax_type VARCHAR(30) NOT NULL,
  tracking_option1 VARCHAR(100),
  invoice_number INTEGER,
  source VARCHAR(20) DEFAULT 'monday' CHECK (source IN ('monday', 'meta_ads', 'google_ads', 'manual')),
  confidence VARCHAR(10) DEFAULT 'high' CHECK (confidence IN ('high', 'medium', 'low')),
  matched_keyword TEXT,
  review_status VARCHAR(20) DEFAULT 'auto' CHECK (review_status IN ('auto', 'reviewed', 'flagged', 'corrected')),
  review_notes TEXT,
  original_values JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add Xero sync fields to existing invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS xero_invoice_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS xero_status VARCHAR(20);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS eom_run_id UUID REFERENCES eom_runs(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_eom_runs_month_year ON eom_runs(year, month);
CREATE INDEX IF NOT EXISTS idx_eom_line_items_run ON eom_line_items(run_id);
CREATE INDEX IF NOT EXISTS idx_eom_line_items_client ON eom_line_items(client_name);
CREATE INDEX IF NOT EXISTS idx_eom_line_items_review ON eom_line_items(run_id, review_status);
