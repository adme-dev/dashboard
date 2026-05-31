-- 125: First-party tracking foundation (Slice 1)
-- tracking_sites: per-client tag config (write key, allowed origins, behaviour flags)
-- tracking_events: raw behavioural events. NO raw PII in Slice 1 (added in Slice 3).

CREATE TABLE IF NOT EXISTS tracking_sites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  write_key       TEXT NOT NULL UNIQUE,
  allowed_origins TEXT[] NOT NULL DEFAULT '{}',
  spa             BOOLEAN NOT NULL DEFAULT FALSE,
  consent_mode    TEXT NOT NULL DEFAULT 'off',   -- off | au_optout | consent_gated
  lead_selectors  TEXT[] NOT NULL DEFAULT '{}',
  retention_days  INTEGER NOT NULL DEFAULT 395,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tracking_sites_client ON tracking_sites(client_id);
CREATE INDEX IF NOT EXISTS idx_tracking_sites_write_key ON tracking_sites(write_key);

CREATE TABLE IF NOT EXISTS tracking_events (
  id           BIGSERIAL PRIMARY KEY,
  site_id      UUID NOT NULL REFERENCES tracking_sites(id) ON DELETE CASCADE,
  client_id    UUID NOT NULL,
  event_id     TEXT NOT NULL,
  anon_id      TEXT NOT NULL,
  session_id   TEXT,
  event_name   TEXT NOT NULL,
  page_url     TEXT,
  referrer     TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT,
  gclid TEXT, gbraid TEXT, wbraid TEXT, fbclid TEXT, fbc TEXT, fbp TEXT,
  ttclid TEXT, msclkid TEXT, li_fat_id TEXT,
  event_data   JSONB NOT NULL DEFAULT '{}',
  consent      JSONB,
  ua           TEXT,
  ip_hash      TEXT,
  origin       TEXT,
  occurred_at  TIMESTAMPTZ,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_events_dedup ON tracking_events(site_id, event_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_client_time ON tracking_events(client_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_session ON tracking_events(session_id);
