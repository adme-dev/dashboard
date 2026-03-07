-- 058-quotes-xero-integration.sql
-- Briefs → Xero Quotes Integration
-- Adds Xero tracking columns to quotes, requires_quote flag to templates, quote FK on briefs

-- Xero tracking on quotes
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS xero_quote_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS xero_quote_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS xero_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS xero_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS xero_invoice_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_quotes_xero_id ON quotes(xero_quote_id) WHERE xero_quote_id IS NOT NULL;

-- Brief template: controls whether approval triggers quote generation
ALTER TABLE brief_templates ADD COLUMN IF NOT EXISTS requires_quote BOOLEAN DEFAULT false;

-- Brief: link to generated quote
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_briefs_quote ON briefs(quote_id) WHERE quote_id IS NOT NULL;

-- Default currency to AUD (matches existing invoice config)
ALTER TABLE quotes ALTER COLUMN currency SET DEFAULT 'AUD';
