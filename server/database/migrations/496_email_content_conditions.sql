-- Authoring catalog only. Frozen source copies predicates, never mutable IDs.
-- Coordinator applies this migration after review; worker does not access DB.
CREATE TABLE IF NOT EXISTS email_content_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  predicate jsonb NOT NULL CHECK (jsonb_typeof(predicate) = 'object' AND octet_length(predicate::text) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, name)
);
CREATE INDEX IF NOT EXISTS email_content_conditions_client ON email_content_conditions(client_id);
