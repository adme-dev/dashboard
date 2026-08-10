BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_advisory_xact_lock(
  hashtextextended('crm-search-migration-353-malformed-transport-dead-letters', 0)
);

CREATE TABLE IF NOT EXISTS crm_search_malformed_transport_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_message_id_digest TEXT NOT NULL UNIQUE
    CHECK (queue_message_id_digest ~ '^sha256:[a-f0-9]{64}$'),
  protocol_version INTEGER NOT NULL CHECK (protocol_version = 1),
  queue_name TEXT NOT NULL CHECK (queue_name = 'dead_letter'),
  attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 1000),
  first_received_at TIMESTAMPTZ NOT NULL,
  last_received_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_expires_at TIMESTAMPTZ NOT NULL,
  legal_hold_id UUID REFERENCES crm_search_legal_holds(id) ON DELETE RESTRICT,
  CHECK (last_received_at >= first_received_at)
);

CREATE INDEX IF NOT EXISTS crm_search_malformed_transport_dead_letters_received
  ON crm_search_malformed_transport_dead_letters (last_received_at, id);

DROP TRIGGER IF EXISTS crm_search_retention_delete_guard
  ON crm_search_malformed_transport_dead_letters;
CREATE TRIGGER crm_search_retention_delete_guard
  BEFORE DELETE ON crm_search_malformed_transport_dead_letters
  FOR EACH ROW EXECUTE FUNCTION crm_search_reject_governed_evidence_mutation();

REVOKE ALL ON TABLE crm_search_malformed_transport_dead_letters
FROM PUBLIC, crm_search_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE crm_search_malformed_transport_dead_letters
TO crm_search_runtime;
REVOKE DELETE, TRUNCATE ON TABLE crm_search_malformed_transport_dead_letters
FROM PUBLIC;

COMMENT ON TABLE crm_search_malformed_transport_dead_letters IS
  'Bounded privacy-safe identity evidence for malformed Cloudflare DLQ envelopes; raw transport bodies are structurally absent.';

COMMIT;
