-- Bind the per-dealership Google Ads accounts of multi-account dealer groups.
--
-- Follows 511 (single-account clients). A dealer-group client (e.g. Northern Motor Group) owns one
-- Google Ads account per brand dealership. google_ads_account_bindings allows one canonical
-- (alias-less) binding per role per client, so brand accounts bind through a client alias — one
-- alias per dealership — exactly as the measurement-account design (405) intends.
--
-- Mapping is taken verbatim from Google's own account names, never inferred:
--   * an account whose name equals the client name (case-insensitive) is the client's 'group' account;
--   * every other account binds as 'dealer' through the client alias with the same name
--     (case-insensitive); an alias is created from the Google account name when none exists.
-- Only active clients with 2+ active Google connections whose OAuth scopes include the AdWords API
-- and with a numeric operating customer id. Bindings only grant reads within the SAME client.
-- Configuration metadata only: no provider call, no spend, no destination change. Idempotent; each
-- binding created here gets one append-only 'seeded' event.
BEGIN;

CREATE TEMP TABLE m512_accounts ON COMMIT DROP AS
SELECT sc.client_id,
       sc.id AS connection_id,
       TRIM(sc.account_name) AS account_name,
       REGEXP_REPLACE(sc.account_id, '[^0-9]', '', 'g') AS operating_customer_id,
       LOWER(TRIM(sc.account_name)) = LOWER(TRIM(ac.name)) AS is_group_account
  FROM social_connections sc
  JOIN agency_clients ac ON ac.id = sc.client_id AND ac.is_active
 WHERE sc.platform = 'google'
   AND sc.status = 'active'
   AND sc.scopes::text ILIKE '%adwords%'
   AND COALESCE(TRIM(sc.account_name), '') <> ''
   AND REGEXP_REPLACE(COALESCE(sc.account_id, ''), '[^0-9]', '', 'g') ~ '^[0-9]{1,20}$'
   AND sc.client_id IN (
     SELECT client_id FROM social_connections
      WHERE platform = 'google' AND status = 'active'
      GROUP BY client_id HAVING COUNT(*) > 1
   )
   AND NOT EXISTS (
     SELECT 1 FROM google_ads_account_bindings b
      WHERE b.client_id = sc.client_id AND b.connection_id = sc.id
   );

-- Group accounts: canonical 'group' binding (only when the client has no group binding yet).
INSERT INTO google_ads_account_bindings (client_id, alias_id, connection_id, operating_customer_id, account_role, created_by)
SELECT a.client_id, NULL, a.connection_id, a.operating_customer_id, 'group', 'migration:512'
  FROM m512_accounts a
 WHERE a.is_group_account
   AND NOT EXISTS (
     SELECT 1 FROM google_ads_account_bindings b
      WHERE b.client_id = a.client_id AND b.account_role = 'group' AND b.alias_id IS NULL
   )
ON CONFLICT DO NOTHING;

-- Missing dealership aliases, named exactly as the Google Ads account.
INSERT INTO agency_client_aliases (client_id, alias, source)
SELECT DISTINCT a.client_id, a.account_name, 'google_ads_account_name'
  FROM m512_accounts a
 WHERE NOT a.is_group_account
   AND NOT EXISTS (
     SELECT 1 FROM agency_client_aliases x
      WHERE x.client_id = a.client_id AND LOWER(TRIM(x.alias)) = LOWER(a.account_name)
   );

-- Dealership accounts: one 'dealer' binding per alias.
INSERT INTO google_ads_account_bindings (client_id, alias_id, connection_id, operating_customer_id, account_role, created_by)
SELECT a.client_id, x.id, a.connection_id, a.operating_customer_id, 'dealer', 'migration:512'
  FROM m512_accounts a
  JOIN LATERAL (
    SELECT id FROM agency_client_aliases x
     WHERE x.client_id = a.client_id AND LOWER(TRIM(x.alias)) = LOWER(a.account_name)
     ORDER BY x.created_at
     LIMIT 1
  ) x ON TRUE
 WHERE NOT a.is_group_account
ON CONFLICT DO NOTHING;

INSERT INTO google_ads_account_binding_events (binding_id, client_id, event_type, actor_type, actor_id, evidence)
SELECT b.id, b.client_id, 'seeded', 'migration', '512',
       jsonb_build_object(
         'connectionId', b.connection_id,
         'operatingCustomerId', b.operating_customer_id,
         'accountRole', b.account_role,
         'aliasId', b.alias_id,
         'reason', 'dealer_group_account_name'
       )
  FROM google_ads_account_bindings b
 WHERE b.created_by = 'migration:512'
   AND NOT EXISTS (
     SELECT 1 FROM google_ads_account_binding_events e
      WHERE e.binding_id = b.id AND e.event_type = 'seeded'
   );

COMMIT;
