-- 132: email marketing core — subscribers, lists, membership (Phase 1)
-- Agency-first: client_id is nullable (NULL = agency-wide scope). Designed for
-- future per-client scoping. Campaigns / events / suppression land in later phases.

CREATE EXTENSION IF NOT EXISTS citext;

-- Global subscriber records, deduped by email (case-insensitive via citext).
CREATE TABLE IF NOT EXISTS email_subscribers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      CITEXT NOT NULL UNIQUE,
  name       TEXT,
  attribs    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status     TEXT NOT NULL DEFAULT 'enabled'
             CHECK (status IN ('enabled','disabled','blocklisted')),
  client_id  UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Named lists. double_optin toggles the confirmation flow (used in Phase 4).
CREATE TABLE IF NOT EXISTS email_lists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  client_id    UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
  double_optin BOOLEAN NOT NULL DEFAULT false,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at  TIMESTAMPTZ
);

-- Many-to-many membership with per-list subscription state.
CREATE TABLE IF NOT EXISTS subscriber_lists (
  subscriber_id   UUID NOT NULL REFERENCES email_subscribers(id) ON DELETE CASCADE,
  list_id         UUID NOT NULL REFERENCES email_lists(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'unconfirmed'
                  CHECK (status IN ('unconfirmed','confirmed','unsubscribed')),
  source          TEXT NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('import','form','manual','leads','clients')),
  subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  PRIMARY KEY (subscriber_id, list_id)
);

CREATE INDEX IF NOT EXISTS idx_email_subscribers_client ON email_subscribers(client_id);
CREATE INDEX IF NOT EXISTS idx_email_lists_client ON email_lists(client_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_subscriber_lists_list ON subscriber_lists(list_id, status);
