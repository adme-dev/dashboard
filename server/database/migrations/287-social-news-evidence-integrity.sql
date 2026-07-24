-- Canonical identity and integrity metadata for shared automotive news evidence.
-- The trigger keeps every ingestion path consistent without coupling providers
-- to the projection used by social, analytics, CRM, or campaign planning.

ALTER TABLE social_news_items
  ADD COLUMN IF NOT EXISTS provider_record_id TEXT,
  ADD COLUMN IF NOT EXISTS raw_checksum TEXT,
  ADD COLUMN IF NOT EXISTS connector_version TEXT NOT NULL DEFAULT 'mcp-news-v1',
  ADD COLUMN IF NOT EXISTS evidence_schema_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS projection_warnings TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_news_items_provider_record
  ON social_news_items (source, provider_record_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_news_items_raw_checksum
  ON social_news_items (raw_checksum);

CREATE TABLE IF NOT EXISTS social_news_schema_events (
  id BIGSERIAL PRIMARY KEY,
  item_id TEXT NOT NULL,
  source TEXT NOT NULL,
  provider_record_id TEXT,
  raw_checksum TEXT,
  connector_version TEXT NOT NULL,
  evidence_schema_version INTEGER NOT NULL,
  warnings TEXT[] NOT NULL,
  observed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, raw_checksum)
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_news_schema_events_created
  ON social_news_schema_events (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_news_schema_events_source
  ON social_news_schema_events (source, created_at DESC);

CREATE TABLE IF NOT EXISTS social_news_ingestion_dead_letters (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT,
  provider_record_id TEXT,
  connector_version TEXT,
  payload JSONB,
  errors TEXT[] NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_news_dead_letters_unresolved
  ON social_news_ingestion_dead_letters (source, last_error_at DESC)
  WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION prepare_social_news_evidence_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  payload JSONB := COALESCE(NEW.raw, '{}'::JSONB);
BEGIN
  NEW.provider_record_id := COALESCE(
    NULLIF(payload->>'id', ''),
    NULLIF(payload->>'story_id', ''),
    NULLIF(payload->>'storyId', ''),
    NULLIF(payload->>'slug', ''),
    NULLIF(NEW.external_id, ''),
    NEW.id::TEXT
  );

  NEW.raw_checksum := MD5(payload::TEXT);
  NEW.connector_version := COALESCE(
    NULLIF(payload->>'connector_version', ''),
    NULLIF(payload->>'connectorVersion', ''),
    NULLIF(payload #>> '{_xeroflow,connectorVersion}', ''),
    NULLIF(NEW.connector_version, ''),
    'mcp-news-v1'
  );
  NEW.evidence_schema_version := GREATEST(COALESCE(NEW.evidence_schema_version, 1), 1);

  NEW.projection_warnings := ARRAY_REMOVE(ARRAY[
    CASE WHEN payload = '{}'::JSONB THEN 'missing_raw_payload' END,
    CASE WHEN JSONB_TYPEOF(payload) <> 'object' THEN 'invalid_raw_shape' END,
    CASE WHEN NEW.provider_record_id IS NULL THEN 'missing_provider_record_id' END,
    CASE WHEN COALESCE(NULLIF(NEW.source_url, ''), NULLIF(payload->>'url', '')) IS NULL THEN 'missing_story_url' END,
    CASE WHEN NULLIF(NEW.title, '') IS NULL THEN 'missing_title' END,
    CASE WHEN payload ? 'topics' AND JSONB_TYPEOF(payload->'topics') <> 'array' THEN 'invalid_topics_shape' END,
    CASE WHEN payload ? 'outlets' AND JSONB_TYPEOF(payload->'outlets') <> 'array' THEN 'invalid_outlets_shape' END,
    CASE WHEN payload ? 'summary' AND JSONB_TYPEOF(payload->'summary') NOT IN ('object', 'string') THEN 'invalid_summary_shape' END
  ], NULL);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_social_news_evidence_integrity ON social_news_items;
CREATE TRIGGER trg_prepare_social_news_evidence_integrity
BEFORE INSERT OR UPDATE OF raw, external_id, source_url, title, connector_version, evidence_schema_version
ON social_news_items
FOR EACH ROW
EXECUTE FUNCTION prepare_social_news_evidence_integrity();

CREATE OR REPLACE FUNCTION record_social_news_schema_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  observed TEXT[] := CASE
    WHEN JSONB_TYPEOF(COALESCE(NEW.raw, '{}'::JSONB)) = 'object' THEN ARRAY(
      SELECT key
      FROM JSONB_OBJECT_KEYS(COALESCE(NEW.raw, '{}'::JSONB)) AS key
      ORDER BY key
    )
    ELSE ARRAY[]::TEXT[]
  END;
BEGIN
  IF CARDINALITY(NEW.projection_warnings) > 0 THEN
    INSERT INTO social_news_schema_events (
      item_id,
      source,
      provider_record_id,
      raw_checksum,
      connector_version,
      evidence_schema_version,
      warnings,
      observed_fields
    )
    VALUES (
      NEW.id::TEXT,
      NEW.source,
      NEW.provider_record_id,
      NEW.raw_checksum,
      NEW.connector_version,
      NEW.evidence_schema_version,
      NEW.projection_warnings,
      observed
    )
    ON CONFLICT (item_id, raw_checksum) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_social_news_schema_event ON social_news_items;
CREATE TRIGGER trg_record_social_news_schema_event
AFTER INSERT OR UPDATE
ON social_news_items
FOR EACH ROW
EXECUTE FUNCTION record_social_news_schema_event();

-- Existing rows intentionally remain nullable for provider identity/checksum.
-- Runtime projection fallbacks preserve behavior, while future provider upserts
-- populate these columns. A separately operated batched backfill can be added
-- after production row volume and lock budgets are measured.

COMMENT ON TABLE social_news_schema_events IS
  'Schema and projection warnings observed while normalizing shared social-news evidence.';

COMMENT ON TABLE social_news_ingestion_dead_letters IS
  'Provider payloads rejected before social_news_items insertion, retained for controlled retry and resolution.';
