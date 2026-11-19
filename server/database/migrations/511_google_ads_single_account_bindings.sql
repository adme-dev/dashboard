-- Bind every active client that has EXACTLY ONE active Google Ads connection to that account.
--
-- Why: the staff Google Ads MCP/chat tools only read live accounts that carry an exact
-- google_ads_account_bindings mapping (googleAdsAccess.ts assertGoogleAdsConnection). Until now only
-- Knox LDV (migration 410) had one, so live recommendation/conversion-action/search-term reads worked
-- for a single client. A client with one connection has no ambiguity about which account is theirs.
--
-- Scope and safety:
--   * configuration metadata only — no provider call, no spend, no destination change;
--   * only active agency clients, active Google connections whose OAuth scopes include the AdWords API,
--     and a numeric operating customer id;
--   * clients with 2+ Google connections (dealer groups) are deliberately EXCLUDED — which account is
--     which dealership needs a human decision (aliases), never a guess;
--   * a client that already has any binding is left untouched;
--   * idempotent: re-running inserts nothing new; every binding seeded here gets one append-only
--     'seeded' event with its evidence.
-- Rollback: binding events are append-only by design, so reverse with a reviewed follow-up
-- migration (record a 'disabled' event, then remove the binding) rather than ad-hoc deletes.
BEGIN;

WITH single_account_clients AS (
  SELECT sc.client_id
    FROM social_connections sc
    JOIN agency_clients ac ON ac.id = sc.client_id AND ac.is_active
   WHERE sc.platform = 'google' AND sc.status = 'active'
   GROUP BY sc.client_id
  HAVING COUNT(*) = 1
),
candidates AS (
  SELECT sc.client_id,
         sc.id AS connection_id,
         REGEXP_REPLACE(sc.account_id, '[^0-9]', '', 'g') AS operating_customer_id
    FROM social_connections sc
    JOIN single_account_clients s ON s.client_id = sc.client_id
   WHERE sc.platform = 'google'
     AND sc.status = 'active'
     AND sc.scopes::text ILIKE '%adwords%'
     AND REGEXP_REPLACE(COALESCE(sc.account_id, ''), '[^0-9]', '', 'g') ~ '^[0-9]{1,20}$'
     AND NOT EXISTS (SELECT 1 FROM google_ads_account_bindings b WHERE b.client_id = sc.client_id)
)
INSERT INTO google_ads_account_bindings (
  client_id, alias_id, connection_id, operating_customer_id, account_role, created_by
)
SELECT client_id, NULL, connection_id, operating_customer_id, 'dealer', 'migration:511'
  FROM candidates
ON CONFLICT DO NOTHING;

INSERT INTO google_ads_account_binding_events (
  binding_id, client_id, event_type, actor_type, actor_id, evidence
)
SELECT b.id, b.client_id, 'seeded', 'migration', '511',
       jsonb_build_object(
         'connectionId', b.connection_id,
         'operatingCustomerId', b.operating_customer_id,
         'accountRole', b.account_role,
         'reason', 'single_active_google_connection'
       )
  FROM google_ads_account_bindings b
 WHERE b.created_by = 'migration:511'
   AND NOT EXISTS (
     SELECT 1 FROM google_ads_account_binding_events e
      WHERE e.binding_id = b.id AND e.event_type = 'seeded'
   );

COMMIT;
