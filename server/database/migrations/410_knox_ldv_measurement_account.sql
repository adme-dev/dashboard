-- Bind the Knox LDV canonical client to its exact Google Ads operating
-- customer. This is configuration metadata only; it performs no provider or
-- destination mutation.

BEGIN;

DO $$
DECLARE
  pilot_issue TEXT;
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM agency_clients
       WHERE id = '2e15c35e-0f11-43ae-b13d-7fd1000570d4'::uuid
         AND LOWER(name) = LOWER('Knox LDV')
    ) THEN 'canonical client missing or mismatched'
    WHEN NOT EXISTS (
      SELECT 1
        FROM social_connections
       WHERE id = '6e252890-f426-498a-a074-0d25bf0f3bea'::uuid
         AND client_id = '2e15c35e-0f11-43ae-b13d-7fd1000570d4'::uuid
         AND platform = 'google'
         AND status = 'active'
         AND REGEXP_REPLACE(account_id, '[^0-9]', '', 'g') = '3892176492'
    ) THEN 'Google connection missing or mismatched'
    ELSE NULL
  END INTO pilot_issue;

  IF pilot_issue IS NOT NULL THEN
    RAISE EXCEPTION 'Knox LDV measurement-account seed failed: %', pilot_issue;
  END IF;
END
$$;

INSERT INTO google_ads_account_bindings (
  client_id,
  alias_id,
  connection_id,
  operating_customer_id,
  account_role,
  created_by
) VALUES (
  '2e15c35e-0f11-43ae-b13d-7fd1000570d4'::uuid,
  NULL,
  '6e252890-f426-498a-a074-0d25bf0f3bea'::uuid,
  '3892176492',
  'dealer',
  'migration:410'
)
ON CONFLICT (client_id, connection_id) DO UPDATE SET
  alias_id = EXCLUDED.alias_id,
  operating_customer_id = EXCLUDED.operating_customer_id,
  account_role = EXCLUDED.account_role,
  updated_at = NOW();

INSERT INTO google_ads_account_binding_events (
  binding_id, client_id, event_type, actor_type, actor_id, evidence
)
SELECT
  binding.id,
  binding.client_id,
  'seeded',
  'migration',
  '410',
  jsonb_build_object(
    'connectionId', binding.connection_id,
    'operatingCustomerId', binding.operating_customer_id,
    'accountRole', binding.account_role
  )
FROM google_ads_account_bindings binding
WHERE binding.client_id = '2e15c35e-0f11-43ae-b13d-7fd1000570d4'::uuid
  AND binding.connection_id = '6e252890-f426-498a-a074-0d25bf0f3bea'::uuid
  AND NOT EXISTS (
    SELECT 1
      FROM google_ads_account_binding_events event
     WHERE event.binding_id = binding.id
       AND event.event_type = 'seeded'
       AND event.actor_id = '410'
  );

COMMIT;
