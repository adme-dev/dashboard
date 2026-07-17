-- 258: enforce Auto Feed rule tenancy and the event types the runtime derives.
-- NOT VALID preserves any legacy rows while enforcing the constraints for all
-- new writes. Existing rows can be remediated and validated independently.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_post_rules_client_id_fkey'
  ) THEN
    ALTER TABLE feed_post_rules
      ADD CONSTRAINT feed_post_rules_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES agency_clients(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feed_post_rules_supported_events_check'
  ) THEN
    ALTER TABLE feed_post_rules
      ADD CONSTRAINT feed_post_rules_supported_events_check
      CHECK (cardinality(event_types) > 0 AND event_types <@ ARRAY['new', 'listing']::text[]) NOT VALID;
  END IF;
END $$;
