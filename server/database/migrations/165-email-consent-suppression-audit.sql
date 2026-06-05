-- 165: email consent + suppression audit foundation
-- Additive only. Keeps the current subscriber/list/campaign model intact while
-- recording the proof trail needed for imports, opt-outs, bounces, complaints,
-- and future client-scoped list governance.

CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE email_subscribers
  ADD COLUMN IF NOT EXISTS soft_bounce_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE email_subscribers
  ADD COLUMN IF NOT EXISTS last_soft_bounce_at TIMESTAMPTZ;

ALTER TABLE suppression_list
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE email_events
  DROP CONSTRAINT IF EXISTS email_events_event_type_check;

ALTER TABLE email_events
  ADD CONSTRAINT email_events_event_type_check
  CHECK (event_type IN (
    'sent',
    'delivered',
    'opened',
    'clicked',
    'bounced',
    'complained',
    'unsubscribed',
    'delivery_delayed'
  ));

CREATE TABLE IF NOT EXISTS email_consent_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID REFERENCES email_subscribers(id) ON DELETE SET NULL,
  email         CITEXT NOT NULL,
  list_id       UUID REFERENCES email_lists(id) ON DELETE SET NULL,
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL
                CHECK (event_type IN (
                  'form_submitted',
                  'confirmed',
                  'imported',
                  'manual_added',
                  'list_unsubscribed',
                  'global_unsubscribed',
                  'resubscribed'
                )),
  source        TEXT NOT NULL
                CHECK (source IN (
                  'form',
                  'import',
                  'manual',
                  'leads',
                  'clients',
                  'preference_center',
                  'one_click',
                  'webhook',
                  'system'
                )),
  actor_user_id UUID,
  ip_address    INET,
  user_agent    TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppression_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          CITEXT NOT NULL,
  subscriber_id  UUID REFERENCES email_subscribers(id) ON DELETE SET NULL,
  campaign_id    UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  reason         TEXT NOT NULL
                 CHECK (reason IN (
                   'hard_bounce',
                   'complaint',
                   'manual',
                   'global_unsubscribe',
                   'soft_bounce'
                 )),
  action         TEXT NOT NULL
                 CHECK (action IN ('added', 'ignored', 'removed', 'recorded')),
  source         TEXT NOT NULL
                 CHECK (source IN (
                   'webhook',
                   'one_click',
                   'preference_center',
                   'manual',
                   'system'
                 )),
  actor_user_id  UUID,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_consent_events_subscriber
  ON email_consent_events(subscriber_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_consent_events_email
  ON email_consent_events(email, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_consent_events_list
  ON email_consent_events(list_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_suppression_events_email
  ON suppression_events(email, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_suppression_events_subscriber
  ON suppression_events(subscriber_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_suppression_events_campaign
  ON suppression_events(campaign_id, occurred_at DESC);
