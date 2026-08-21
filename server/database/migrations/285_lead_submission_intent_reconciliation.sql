-- Short-lived, PII-minimised bridge between website form intent and a later
-- provider-confirmed lead. Raw email/phone values are never persisted.

CREATE TABLE IF NOT EXISTS lead_submission_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES tracking_sites(id) ON DELETE CASCADE,
  browser_event_id TEXT NOT NULL,
  email_fingerprint TEXT,
  phone_fingerprint TEXT,
  form_id TEXT,
  page_url TEXT,
  vehicle_reference TEXT,
  attribution JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  match_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (match_status IN ('pending', 'reserved', 'matched', 'expired')),
  reservation_token UUID,
  reserved_until TIMESTAMPTZ,
  matched_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  matched_at TIMESTAMPTZ,
  match_confidence INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email_fingerprint IS NOT NULL OR phone_fingerprint IS NOT NULL),
  UNIQUE (site_id, browser_event_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_submission_intents_email
  ON lead_submission_intents (client_id, email_fingerprint, occurred_at DESC)
  WHERE email_fingerprint IS NOT NULL AND matched_lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_submission_intents_phone
  ON lead_submission_intents (client_id, phone_fingerprint, occurred_at DESC)
  WHERE phone_fingerprint IS NOT NULL AND matched_lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_submission_intents_expiry
  ON lead_submission_intents (expires_at)
  WHERE match_status <> 'matched';
