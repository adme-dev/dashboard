-- Universal email lead ingestion foundation.
-- The Worker stages only encrypted raw MIME in R2; these tables retain safe metadata.

BEGIN;

CREATE TABLE IF NOT EXISTS lead_email_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  address_prefix TEXT NOT NULL,
  address_token TEXT NOT NULL UNIQUE,
  email_address TEXT NOT NULL UNIQUE,
  expected_provider TEXT,
  parser_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (parser_mode IN ('auto', 'adf', 'generic')),
  ai_extraction_mode TEXT NOT NULL DEFAULT 'disabled'
    CHECK (ai_extraction_mode IN ('disabled', 'fallback')),
  allowed_sender_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_max_silence_hours INTEGER
    CHECK (expected_max_silence_hours IS NULL OR expected_max_silence_hours BETWEEN 1 AND 8760),
  first_response_sla_minutes INTEGER
    CHECK (first_response_sla_minutes IS NULL OR first_response_sla_minutes BETWEEN 1 AND 43200),
  form_id TEXT NOT NULL,
  form_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  previous_address_token TEXT,
  previous_token_grace_until TIMESTAMPTZ,
  last_received_at TIMESTAMPTZ,
  last_accepted_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(allowed_sender_domains) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_lead_email_endpoints_client
  ON lead_email_endpoints(client_id, enabled, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_email_endpoints_previous_token
  ON lead_email_endpoints(previous_address_token)
  WHERE previous_address_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS lead_email_ingestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES lead_email_endpoints(id) ON DELETE RESTRICT,
  client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  correlation_id UUID NOT NULL UNIQUE,
  transport TEXT NOT NULL
    CHECK (transport IN ('cloudflare_email_routing')),
  external_id_hash TEXT NOT NULL
    CONSTRAINT lead_email_ingestions_external_id_hash_check
    CHECK (external_id_hash ~ '^[a-f0-9]{64}$'),
  provider TEXT NOT NULL,
  parser TEXT
    CONSTRAINT lead_email_ingestions_parser_check
    CHECK (parser IS NULL OR parser IN ('adf', 'provider', 'generic', 'ai_fallback')),
  status TEXT NOT NULL
    CHECK (status IN ('received', 'accepted', 'duplicate', 'quarantined', 'failed')),
  confidence NUMERIC(5,4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  sender_domain TEXT,
  message_id_hash TEXT
    CONSTRAINT lead_email_ingestions_message_id_hash_check
    CHECK (message_id_hash IS NULL OR message_id_hash ~ '^[a-f0-9]{64}$'),
  safe_evidence JSONB NOT NULL
    DEFAULT '{"hasText":false,"hasHtml":false,"hasAdf":false,"fieldKeys":[]}'::jsonb,
  staged_object_key TEXT,
  staged_expires_at TIMESTAMPTZ,
  error_class TEXT,
  processing_ms INTEGER
    CONSTRAINT lead_email_ingestions_processing_ms_check
    CHECK (processing_ms IS NULL OR processing_ms >= 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ,
  terminal_at TIMESTAMPTZ,
  possible_duplicate_of_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  duplicate_match_basis TEXT
    CHECK (duplicate_match_basis IS NULL OR duplicate_match_basis IN ('email_hmac', 'phone_hmac', 'email_phone_hmac')),
  duplicate_confidence NUMERIC(5,4) CHECK (duplicate_confidence IS NULL OR duplicate_confidence BETWEEN 0 AND 1),
  duplicate_window_hours INTEGER
    CONSTRAINT lead_email_ingestions_duplicate_window_hours_check
    CHECK (duplicate_window_hours IS NULL OR duplicate_window_hours BETWEEN 1 AND 8760),
  replayed_from UUID REFERENCES lead_email_ingestions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(endpoint_id, external_id_hash),
  CONSTRAINT lead_email_ingestions_safe_evidence_check CHECK (
    CASE
      WHEN jsonb_typeof(safe_evidence) = 'object'
        AND safe_evidence ?& ARRAY['hasText', 'hasHtml', 'hasAdf', 'fieldKeys']
        AND (safe_evidence - ARRAY['hasText', 'hasHtml', 'hasAdf', 'fieldKeys']) = '{}'::jsonb
        AND jsonb_typeof(safe_evidence->'hasText') = 'boolean'
        AND jsonb_typeof(safe_evidence->'hasHtml') = 'boolean'
        AND jsonb_typeof(safe_evidence->'hasAdf') = 'boolean'
        AND jsonb_typeof(safe_evidence->'fieldKeys') = 'array'
      THEN jsonb_array_length(safe_evidence->'fieldKeys') <= 100
        AND jsonb_array_length(jsonb_path_query_array(
          safe_evidence,
          '$.fieldKeys[*] ? (@.type() == "string" && @ like_regex "^[A-Za-z][A-Za-z0-9_.-]{0,254}$")'
        )) = jsonb_array_length(safe_evidence->'fieldKeys')
      ELSE FALSE
    END
  ),
  CONSTRAINT lead_email_ingestions_duplicate_signal_check CHECK (
    (
      duplicate_match_basis IS NULL
      AND duplicate_confidence IS NULL
      AND duplicate_window_hours IS NULL
      AND possible_duplicate_of_lead_id IS NULL
    )
    OR (
      duplicate_match_basis IS NOT NULL
      AND duplicate_confidence IS NOT NULL
      AND duplicate_window_hours IS NOT NULL
      AND possible_duplicate_of_lead_id IS NOT NULL
    )
  ),
  CONSTRAINT lead_email_ingestions_replay_self_check
    CHECK (replayed_from IS NULL OR replayed_from <> id),
  CONSTRAINT lead_email_ingestions_lifecycle_check CHECK (
    (status IN ('accepted', 'duplicate', 'quarantined') AND terminal_at IS NOT NULL AND next_attempt_at IS NULL)
    OR (status = 'received' AND terminal_at IS NULL AND next_attempt_at IS NOT NULL AND attempt_count < 5)
    OR (status = 'failed' AND (
      (terminal_at IS NOT NULL AND next_attempt_at IS NULL)
      OR (terminal_at IS NULL AND next_attempt_at IS NOT NULL AND attempt_count < 5)
    ))
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_email_ingestions_endpoint_created
  ON lead_email_ingestions(endpoint_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_email_ingestions_attention
  ON lead_email_ingestions(status, created_at DESC)
  WHERE status IN ('quarantined', 'failed');

CREATE INDEX IF NOT EXISTS idx_lead_email_ingestions_recovery
  ON lead_email_ingestions(next_attempt_at, created_at)
  WHERE terminal_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_email_ingestions_possible_duplicate
  ON lead_email_ingestions(possible_duplicate_of_lead_id)
  WHERE possible_duplicate_of_lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lead_email_ingest_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_email_ingest_nonces_expiry
  ON lead_email_ingest_nonces(expires_at);

DO $$
DECLARE
  existing_expression TEXT;
BEGIN
  SELECT pg_get_expr(conbin, conrelid)
    INTO existing_expression
    FROM pg_constraint
   WHERE conrelid = 'leads'::regclass
     AND conname = 'leads_source_check';

  IF existing_expression IS NULL THEN
    ALTER TABLE leads ADD CONSTRAINT leads_source_check
      CHECK (source IN ('meta', 'google', 'manual', 'webhook', 'csv', 'email'));
  ELSIF position('''email''' IN existing_expression) = 0 THEN
    ALTER TABLE leads DROP CONSTRAINT leads_source_check;
    EXECUTE format(
      'ALTER TABLE leads ADD CONSTRAINT leads_source_check CHECK ((%s) OR source = %L)',
      existing_expression,
      'email'
    );
  END IF;
END
$$;

DO $$
DECLARE
  existing_expression TEXT;
BEGIN
  SELECT pg_get_expr(conbin, conrelid)
    INTO existing_expression
    FROM pg_constraint
   WHERE conrelid = 'lead_form_rules'::regclass
     AND conname = 'lead_form_rules_source_check';

  IF existing_expression IS NULL THEN
    ALTER TABLE lead_form_rules ADD CONSTRAINT lead_form_rules_source_check
      CHECK (source IN ('meta', 'google', 'webhook', 'csv', 'email'));
  ELSIF position('''email''' IN existing_expression) = 0 THEN
    ALTER TABLE lead_form_rules DROP CONSTRAINT lead_form_rules_source_check;
    EXECUTE format(
      'ALTER TABLE lead_form_rules ADD CONSTRAINT lead_form_rules_source_check CHECK ((%s) OR source = %L)',
      existing_expression,
      'email'
    );
  END IF;
END
$$;

COMMIT;
