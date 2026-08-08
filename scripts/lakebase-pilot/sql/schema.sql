CREATE EXTENSION IF NOT EXISTS lakebase_vector CASCADE;
CREATE EXTENSION IF NOT EXISTS lakebase_text CASCADE;
CREATE SCHEMA IF NOT EXISTS lakebase_pilot;

CREATE TABLE IF NOT EXISTS lakebase_pilot.crm_search_documents (
  client_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('person','company','opportunity','activity','task')),
  entity_id UUID NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  body TEXT NOT NULL,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', title || ' ' || COALESCE(subtitle, '') || ' ' || body)
  ) STORED,
  source_updated_at TIMESTAMPTZ,
  content_hash TEXT NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, entity_type, entity_id)
);
