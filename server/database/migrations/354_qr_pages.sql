-- Hosted QR landing pages (S1). A code either redirects to a URL or renders its hosted page.
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS destination_mode TEXT NOT NULL DEFAULT 'url';
ALTER TABLE qr_codes DROP CONSTRAINT IF EXISTS qr_codes_destination_mode_check;
ALTER TABLE qr_codes ADD CONSTRAINT qr_codes_destination_mode_check CHECK (destination_mode IN ('url', 'page'));

CREATE TABLE IF NOT EXISTS qr_pages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id            UUID NOT NULL UNIQUE REFERENCES qr_codes(id) ON DELETE CASCADE,
  template              TEXT NOT NULL DEFAULT 'lead',
  config                JSONB NOT NULL DEFAULT '{}'::jsonb,   -- validated by shared/qr/page.ts QrPageConfigSchema
  competition_id        UUID NULL,
  is_published          BOOLEAN NOT NULL DEFAULT FALSE,
  published_at          TIMESTAMPTZ NULL,
  submissions_count     INTEGER NOT NULL DEFAULT 0,
  created_by            UUID NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qr_page_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id       UUID NOT NULL REFERENCES qr_pages(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('hero', 'logo')),
  storage_key   TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  uploaded_by   UUID NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qr_page_assets_page ON qr_page_assets(page_id);

-- Leads created by hosted pages carry their own source so rules/reporting can target them.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check CHECK (
  source IN ('meta', 'google', 'manual', 'webhook', 'csv', 'email', 'qr')
  OR source ~ '^future_[a-z][a-z0-9_]{0,23}$'
);
ALTER TABLE lead_form_rules DROP CONSTRAINT IF EXISTS lead_form_rules_source_check;
ALTER TABLE lead_form_rules ADD CONSTRAINT lead_form_rules_source_check CHECK (
  source IN ('meta', 'google', 'webhook', 'csv', 'email', 'qr')
  OR source ~ '^future_[a-z][a-z0-9_]{0,23}$'
);
