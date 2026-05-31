-- 136: email marketing campaigns + sending engine schema (Phase 2b)
-- The resumable sending engine: a campaign targets lists, materializes a
-- per-recipient work queue (campaign_recipients), and sends in chunks. Events
-- + suppression tables are created here too (populated by Phase 3 webhooks).
-- All additive / IF NOT EXISTS — safe to (re)run.
-- NOTE: slot 134/135 are claimed by the concurrent CRM branch; this is 136 to
-- avoid a same-number collision when both merge.

CREATE EXTENSION IF NOT EXISTS citext;

-- A campaign: authored as a FlyHub JSON document (body_source), rendered to
-- ready-to-send HTML (body_html, may contain {{merge_tags}}) server-side.
CREATE TABLE IF NOT EXISTS campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  subject       TEXT,
  from_name     TEXT,
  from_email    TEXT,
  reply_to      TEXT,
  preview_text  TEXT,
  body_source   JSONB,
  body_html     TEXT,
  content_type  TEXT NOT NULL DEFAULT 'flyhub'
                CHECK (content_type IN ('flyhub','html')),
  template_id   UUID REFERENCES edm_templates(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','scheduled','sending','paused','sent','cancelled')),
  scheduled_at  TIMESTAMPTZ,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  client_id     UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  created_by    UUID,
  -- denormalized counters (updated by the sender + Phase 3 webhooks)
  to_send       INTEGER NOT NULL DEFAULT 0,
  sent          INTEGER NOT NULL DEFAULT 0,
  delivered     INTEGER NOT NULL DEFAULT 0,
  opened        INTEGER NOT NULL DEFAULT 0,
  clicked       INTEGER NOT NULL DEFAULT 0,
  bounced       INTEGER NOT NULL DEFAULT 0,
  complained    INTEGER NOT NULL DEFAULT 0,
  unsubscribed  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A campaign may target multiple lists.
CREATE TABLE IF NOT EXISTS campaign_lists (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  list_id     UUID NOT NULL REFERENCES email_lists(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, list_id)
);

-- The resumable work queue: one row per recipient per campaign. Crash-safe —
-- all send state lives here, so any interruption is recoverable.
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  subscriber_id     UUID NOT NULL REFERENCES email_subscribers(id) ON DELETE CASCADE,
  email             CITEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','failed','cancelled')),
  resend_message_id TEXT,
  attempts          INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, subscriber_id)
);

-- Delivery/engagement events (populated by Phase 3 Resend webhooks).
CREATE TABLE IF NOT EXISTS email_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  subscriber_id     UUID REFERENCES email_subscribers(id) ON DELETE SET NULL,
  resend_message_id TEXT,
  resend_event_id   TEXT UNIQUE,
  event_type        TEXT NOT NULL
                    CHECK (event_type IN ('sent','delivered','opened','clicked','bounced','complained','unsubscribed')),
  url               TEXT,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw               JSONB
);

-- Global hard stop — never emailed again regardless of list membership.
CREATE TABLE IF NOT EXISTS suppression_list (
  email       CITEXT PRIMARY KEY,
  reason      TEXT NOT NULL
              CHECK (reason IN ('hard_bounce','complaint','manual','global_unsubscribe')),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_client ON campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON campaigns(scheduled_at) WHERE status = 'scheduled';
-- The sender claims pending rows per campaign with FOR UPDATE SKIP LOCKED.
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_pending
  ON campaign_recipients(campaign_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_msgid ON campaign_recipients(resend_message_id);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id, event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_msgid ON email_events(resend_message_id);
