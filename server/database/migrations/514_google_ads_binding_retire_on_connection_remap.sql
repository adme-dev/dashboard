-- Re-mapping an ad account to another client (spend map-account, auto-map, connection PATCH, or the
-- God mode account-map path) changes social_connections.client_id. Google Ads account bindings
-- reference the connection's (client_id, id), so since bindings became common (511/512) every such
-- remap of a bound account failed on the foreign key.
--
-- Retire the account's bindings in the same statement instead: write an append-only 'disabled' event
-- per binding, then delete it. Live Google Ads reads for the account stop until it is bound under its
-- new client (fail closed: a binding never silently follows an account to a different client).
BEGIN;

CREATE OR REPLACE FUNCTION retire_google_ads_bindings_on_connection_remap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    INSERT INTO google_ads_account_binding_events (binding_id, client_id, event_type, actor_type, actor_id, evidence)
    SELECT b.id, b.client_id, 'disabled', 'system', 'social_connection_remap',
           jsonb_build_object('connectionId', b.connection_id, 'operatingCustomerId', b.operating_customer_id,
                              'accountRole', b.account_role, 'aliasId', b.alias_id,
                              'reason', 'connection_client_changed', 'toClientId', NEW.client_id)
      FROM google_ads_account_bindings b
     WHERE b.connection_id = OLD.id;
    DELETE FROM google_ads_account_bindings WHERE connection_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS social_connections_retire_google_ads_bindings ON social_connections;
CREATE TRIGGER social_connections_retire_google_ads_bindings
  BEFORE UPDATE OF client_id ON social_connections
  FOR EACH ROW EXECUTE FUNCTION retire_google_ads_bindings_on_connection_remap();

COMMIT;
