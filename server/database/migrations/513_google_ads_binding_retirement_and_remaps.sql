-- Google Ads account bindings: allow retirement, and apply two account-ownership decisions
-- (Garrix Lopena, 2026-11-19): Brighton GWM owns its Google Ads account; GWS Honda and
-- Garry and Warren Smith Suzuki belong to Garry and Warren Smith.
--
-- 1. Retirement. google_ads_account_binding_events referenced bindings with ON DELETE RESTRICT and is
--    append-only, so a binding could never be removed — which also blocked re-mapping a bound ad
--    account to another client (bindings FK the connection's (client_id, id)). The event log stays
--    append-only and keeps binding_id/client_id as historical values; a 'disabled' event is written
--    before any binding is deleted.
-- 2. Remaps follow the account-map endpoint's semantics: ad_account_client_map row,
--    social_connections.client_id, media_spend.client_id backfill. Spend for both clients is already
--    attributed through ad_account_client_map, so reported spend does not move.
-- Configuration metadata only; no provider call. Idempotent.
BEGIN;

ALTER TABLE google_ads_account_binding_events
  DROP CONSTRAINT IF EXISTS google_ads_account_binding_events_client_id_binding_id_fkey;
CREATE INDEX IF NOT EXISTS idx_google_ads_account_binding_events_binding
  ON google_ads_account_binding_events (binding_id);

-- ---------------------------------------------------------------- Brighton GWM ---------------
CREATE TEMP TABLE m513_brighton ON COMMIT DROP AS
SELECT sc.id AS connection_id, REPLACE(sc.account_id, '-', '') AS customer_id,
       (SELECT id FROM agency_clients WHERE name = 'Brighton GWM' AND is_active) AS to_client
  FROM social_connections sc
 WHERE sc.platform = 'google' AND sc.status = 'active' AND REPLACE(sc.account_id, '-', '') = '3437087580'
   AND sc.client_id IS DISTINCT FROM (SELECT id FROM agency_clients WHERE name = 'Brighton GWM' AND is_active);

INSERT INTO google_ads_account_binding_events (binding_id, client_id, event_type, actor_type, actor_id, evidence)
SELECT b.id, b.client_id, 'disabled', 'migration', '513',
       jsonb_build_object('connectionId', b.connection_id, 'operatingCustomerId', b.operating_customer_id,
                          'accountRole', b.account_role, 'aliasId', b.alias_id,
                          'reason', 'account_owner_changed', 'toClientId', m.to_client)
  FROM google_ads_account_bindings b JOIN m513_brighton m ON m.connection_id = b.connection_id
 WHERE m.to_client IS NOT NULL;

DELETE FROM google_ads_account_bindings b USING m513_brighton m
 WHERE b.connection_id = m.connection_id AND m.to_client IS NOT NULL;

-- The "Brighton GWM" alias on Brighton Auto Group was created by migration 512 only to bind this
-- account; it now collides with the Brighton GWM client name.
DELETE FROM agency_client_aliases a
 WHERE a.alias = 'Brighton GWM' AND a.source = 'google_ads_account_name'
   AND a.client_id = (SELECT id FROM agency_clients WHERE name = 'Brighton Auto Group')
   AND NOT EXISTS (SELECT 1 FROM google_ads_account_bindings b WHERE b.alias_id = a.id);

UPDATE social_connections sc SET client_id = m.to_client, updated_at = NOW()
  FROM m513_brighton m WHERE sc.id = m.connection_id AND m.to_client IS NOT NULL;
UPDATE ad_account_client_map SET xero_client_name = 'Brighton GWM'
 WHERE connection_id IN (SELECT connection_id FROM m513_brighton WHERE to_client IS NOT NULL)
   AND COALESCE(campaign_id, '') = '' AND COALESCE(campaign_name_pattern, '') = '';
UPDATE media_spend ms SET client_id = m.to_client
  FROM m513_brighton m WHERE ms.connection_id = m.connection_id AND m.to_client IS NOT NULL
   AND ms.client_id IS DISTINCT FROM m.to_client;

INSERT INTO google_ads_account_bindings (client_id, alias_id, connection_id, operating_customer_id, account_role, created_by)
SELECT m.to_client, NULL, m.connection_id, m.customer_id, 'dealer', 'migration:513'
  FROM m513_brighton m
 WHERE m.to_client IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM google_ads_account_bindings b
                    WHERE b.client_id = m.to_client AND b.account_role = 'dealer' AND b.alias_id IS NULL)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------- Garry and Warren Smith ---------------
CREATE TEMP TABLE m513_gws ON COMMIT DROP AS
SELECT sc.id AS connection_id, REPLACE(sc.account_id, '-', '') AS customer_id, TRIM(sc.account_name) AS account_name,
       (SELECT id FROM agency_clients WHERE name = 'Garry and Warren Smith' AND is_active) AS to_client
  FROM social_connections sc
 WHERE sc.platform = 'google' AND sc.status = 'active' AND sc.client_id IS NULL
   AND REPLACE(sc.account_id, '-', '') IN ('6276926582', '3996763225');  -- GWS Honda, GWS Suzuki

INSERT INTO ad_account_client_map (connection_id, campaign_id, campaign_name_pattern, xero_client_name, xero_client_code)
SELECT g.connection_id, NULL, NULL, 'Garry and Warren Smith', NULL
  FROM m513_gws g
 WHERE g.to_client IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM ad_account_client_map x WHERE x.connection_id = g.connection_id
                    AND COALESCE(x.campaign_id, '') = '' AND COALESCE(x.campaign_name_pattern, '') = '');
UPDATE social_connections sc SET client_id = g.to_client, updated_at = NOW()
  FROM m513_gws g WHERE sc.id = g.connection_id AND g.to_client IS NOT NULL;
UPDATE media_spend ms SET client_id = g.to_client
  FROM m513_gws g WHERE ms.connection_id = g.connection_id AND g.to_client IS NOT NULL
   AND ms.client_id IS DISTINCT FROM g.to_client;

INSERT INTO agency_client_aliases (client_id, alias, source)
SELECT g.to_client, g.account_name, 'google_ads_account_name'
  FROM m513_gws g
 WHERE g.to_client IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM agency_client_aliases x WHERE x.client_id = g.to_client AND LOWER(TRIM(x.alias)) = LOWER(g.account_name))
   AND NOT EXISTS (SELECT 1 FROM agency_clients c WHERE LOWER(c.name) = LOWER(g.account_name));

INSERT INTO google_ads_account_bindings (client_id, alias_id, connection_id, operating_customer_id, account_role, created_by)
SELECT g.to_client, x.id, g.connection_id, g.customer_id, 'dealer', 'migration:513'
  FROM m513_gws g
  JOIN agency_client_aliases x ON x.client_id = g.to_client AND LOWER(TRIM(x.alias)) = LOWER(g.account_name)
 WHERE g.to_client IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- audit ---------------------
INSERT INTO google_ads_account_binding_events (binding_id, client_id, event_type, actor_type, actor_id, evidence)
SELECT b.id, b.client_id, 'seeded', 'migration', '513',
       jsonb_build_object('connectionId', b.connection_id, 'operatingCustomerId', b.operating_customer_id,
                          'accountRole', b.account_role, 'aliasId', b.alias_id,
                          'reason', 'owner_decision_2026_11_19')
  FROM google_ads_account_bindings b
 WHERE b.created_by = 'migration:513'
   AND NOT EXISTS (SELECT 1 FROM google_ads_account_binding_events e WHERE e.binding_id = b.id AND e.event_type = 'seeded');

COMMIT;
