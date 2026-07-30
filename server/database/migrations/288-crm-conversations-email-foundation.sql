-- 288-crm-conversations-email-foundation.sql
-- Additive canonical storage for tenant-scoped CRM conversations and email.
-- This migration does not configure routes, credentials, Queues, or sending.

BEGIN;

-- Composite keys ensure every CRM relationship can prove tenant ownership.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_companies_client_id_id
  ON crm_companies (client_id, id);

CREATE TABLE IF NOT EXISTS crm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  primary_channel TEXT NOT NULL DEFAULT 'email'
    CHECK (primary_channel IN ('email','sms','call','meeting','social','webchat')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','closed','archived')),
  subject TEXT CHECK (subject IS NULL OR char_length(subject) <= 500),
  person_id UUID,
  company_id UUID,
  lead_id UUID,
  opportunity_id UUID,
  assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_type TEXT
    CHECK (created_by_type IS NULL OR created_by_type IN ('team_member','client_user','system','integration')),
  created_by_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, person_id)
    REFERENCES crm_people (client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, company_id)
    REFERENCES crm_companies (client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, lead_id)
    REFERENCES leads (client_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, opportunity_id)
    REFERENCES crm_opportunities (client_id, id) ON DELETE RESTRICT,
  CHECK ((closed_at IS NULL) = (status = 'open')),
  CHECK ((created_by_type IS NULL) = (created_by_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_crm_conversations_client_recent
  ON crm_conversations (client_id, last_message_at DESC NULLS LAST, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_conversations_person
  ON crm_conversations (client_id, person_id, last_message_at DESC NULLS LAST)
  WHERE person_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_conversations_opportunity
  ON crm_conversations (client_id, opportunity_id, last_message_at DESC NULLS LAST)
  WHERE opportunity_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email','sms','social','webchat')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  provider TEXT NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 100),
  provider_message_id TEXT
    CHECK (provider_message_id IS NULL OR char_length(provider_message_id) <= 500),
  idempotency_key TEXT NOT NULL
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 255),
  internet_message_id TEXT
    CHECK (internet_message_id IS NULL OR char_length(internet_message_id) <= 998),
  in_reply_to TEXT
    CHECK (in_reply_to IS NULL OR char_length(in_reply_to) <= 998),
  threading_references TEXT[] NOT NULL DEFAULT '{}',
  from_address TEXT NOT NULL
    CHECK (char_length(from_address) BETWEEN 3 AND 320),
  from_name TEXT CHECK (from_name IS NULL OR char_length(from_name) <= 320),
  to_addresses JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(to_addresses) = 'array'),
  cc_addresses JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(cc_addresses) = 'array'),
  bcc_addresses JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(bcc_addresses) = 'array'),
  reply_to_address TEXT
    CHECK (reply_to_address IS NULL OR char_length(reply_to_address) <= 320),
  subject TEXT CHECK (subject IS NULL OR char_length(subject) <= 998),
  body_text TEXT,
  body_html TEXT,
  content_summary TEXT
    CHECK (content_summary IS NULL OR char_length(content_summary) <= 2000),
  delivery_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (delivery_status IN ('draft','queued','sending','sent','delivered','deferred','bounced','failed','rejected','complained','cancelled')),
  delivery_status_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failure_code TEXT CHECK (failure_code IS NULL OR char_length(failure_code) <= 100),
  failure_reason TEXT CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 1000),
  raw_mime_r2_key TEXT
    CHECK (raw_mime_r2_key IS NULL OR char_length(raw_mime_r2_key) <= 1024),
  raw_mime_expires_at TIMESTAMPTZ,
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(provider_metadata) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_by_type TEXT NOT NULL
    CHECK (created_by_type IN ('team_member','client_user','system','integration')),
  created_by_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (client_id, id),
  UNIQUE (client_id, idempotency_key),
  FOREIGN KEY (client_id, conversation_id)
    REFERENCES crm_conversations (client_id, id) ON DELETE CASCADE,
  CHECK (jsonb_array_length(to_addresses) > 0),
  CHECK (raw_mime_r2_key IS NOT NULL OR raw_mime_expires_at IS NULL),
  CHECK (created_by_type IN ('system','integration') OR created_by_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_messages_provider_message
  ON crm_messages (client_id, provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_messages_internet_message
  ON crm_messages (client_id, internet_message_id)
  WHERE internet_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_messages_conversation_time
  ON crm_messages (client_id, conversation_id, occurred_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_messages_delivery_work
  ON crm_messages (delivery_status, delivery_status_at)
  WHERE delivery_status IN ('queued','sending','deferred');

CREATE TABLE IF NOT EXISTS crm_message_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 100),
  provider_event_id TEXT
    CHECK (provider_event_id IS NULL OR char_length(provider_event_id) <= 500),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('drafted','queued','sending','sent','delivered','deferred','bounced','failed','rejected','complained','cancelled','received','deduplicated')),
  delivery_status TEXT
    CHECK (delivery_status IS NULL OR delivery_status IN ('draft','queued','sending','sent','delivered','deferred','bounced','failed','rejected','complained','cancelled')),
  occurred_at TIMESTAMPTZ NOT NULL,
  smtp_code TEXT CHECK (smtp_code IS NULL OR char_length(smtp_code) <= 20),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 1000),
  sanitized_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(sanitized_metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, message_id)
    REFERENCES crm_messages (client_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_message_events_provider_event
  ON crm_message_events (client_id, provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_message_events_message_time
  ON crm_message_events (client_id, message_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_message_events_retention
  ON crm_message_events (created_at);

CREATE TABLE IF NOT EXISTS crm_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  filename TEXT NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 500),
  content_type TEXT NOT NULL CHECK (char_length(content_type) BETWEEN 1 AND 255),
  content_id TEXT CHECK (content_id IS NULL OR char_length(content_id) <= 998),
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  r2_object_key TEXT NOT NULL CHECK (char_length(r2_object_key) BETWEEN 1 AND 1024),
  scan_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending','scanning','clean','detected','rejected','error')),
  scan_completed_at TIMESTAMPTZ,
  blocked_reason TEXT
    CHECK (blocked_reason IS NULL OR char_length(blocked_reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  UNIQUE (client_id, message_id, sha256),
  FOREIGN KEY (client_id, message_id)
    REFERENCES crm_messages (client_id, id) ON DELETE CASCADE,
  CHECK ((scan_completed_at IS NULL) = (scan_status IN ('pending','scanning'))),
  CHECK (scan_status NOT IN ('detected','rejected','error') OR blocked_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_crm_message_attachments_scan
  ON crm_message_attachments (scan_status, created_at)
  WHERE scan_status IN ('pending','scanning');

CREATE TABLE IF NOT EXISTS crm_email_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  conversation_id UUID,
  route_kind TEXT NOT NULL
    CHECK (route_kind IN ('lead_inbox','conversation_reply')),
  token_version INTEGER NOT NULL CHECK (token_version > 0),
  route_token_hash TEXT NOT NULL
    CHECK (route_token_hash ~ '^[a-f0-9]{64}$'),
  recipient_domain TEXT NOT NULL
    CHECK (
      recipient_domain = LOWER(recipient_domain)
      AND char_length(recipient_domain) BETWEEN 3 AND 253
    ),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (client_id, id),
  UNIQUE (route_token_hash),
  FOREIGN KEY (client_id, conversation_id)
    REFERENCES crm_conversations (client_id, id) ON DELETE CASCADE,
  CHECK (
    (route_kind = 'lead_inbox' AND conversation_id IS NULL)
    OR (route_kind = 'conversation_reply' AND conversation_id IS NOT NULL)
  ),
  CHECK (revoked_at IS NULL OR is_active = FALSE)
);

CREATE INDEX IF NOT EXISTS idx_crm_email_routes_client_active
  ON crm_email_routes (client_id, route_kind, expires_at)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS crm_email_sender_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL
    CHECK (
      email_address = LOWER(email_address)
      AND char_length(email_address) BETWEEN 3 AND 320
    ),
  display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) <= 320),
  sending_domain TEXT NOT NULL
    CHECK (
      sending_domain = LOWER(sending_domain)
      AND char_length(sending_domain) BETWEEN 3 AND 253
    ),
  provider TEXT NOT NULL DEFAULT 'cloudflare_email'
    CHECK (char_length(provider) BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verifying','ready','degraded','disabled')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  last_verified_at TIMESTAMPTZ,
  failure_reason TEXT CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 1000),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  UNIQUE (client_id, email_address)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_email_sender_identities_default
  ON crm_email_sender_identities (client_id)
  WHERE is_default = TRUE AND status <> 'disabled';
CREATE INDEX IF NOT EXISTS idx_crm_email_sender_identities_health
  ON crm_email_sender_identities (status, last_verified_at);

CREATE TABLE IF NOT EXISTS crm_email_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  sender_identity_id UUID,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 100),
  credential_prefix TEXT NOT NULL
    CHECK (credential_prefix ~ '^xfmail_[a-zA-Z0-9]{8,32}$'),
  secret_hash TEXT NOT NULL CHECK (char_length(secret_hash) BETWEEN 32 AND 255),
  allowed_transports TEXT[] NOT NULL DEFAULT ARRAY['http']::TEXT[],
  allowed_from_addresses TEXT[] NOT NULL DEFAULT '{}',
  allowed_recipient_domains TEXT[] NOT NULL DEFAULT '{}',
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 30
    CHECK (rate_limit_per_minute BETWEEN 1 AND 1000),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, id),
  UNIQUE (credential_prefix),
  FOREIGN KEY (client_id, sender_identity_id)
    REFERENCES crm_email_sender_identities (client_id, id) ON DELETE RESTRICT,
  CHECK (cardinality(allowed_transports) > 0),
  CHECK (allowed_transports <@ ARRAY['http','smtp']::TEXT[]),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_crm_email_credentials_client_active
  ON crm_email_credentials (client_id, created_at DESC)
  WHERE revoked_at IS NULL;

COMMIT;
