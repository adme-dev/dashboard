-- Synthetic acceptance identities only. Execute explicitly on Neon project
-- square-tooth-23821574 / branch br-long-mountain-a4f73v10 / database neondb.
-- Verify Pages preview Hyperdrive 3865ea5568234fc7b0e9e3e595a30286 points to
-- ep-raspy-water-a4v6q356.us-east-1.aws.neon.tech before executing.
-- No passwords, login tokens, provider connections or mail requests are created.
DO $staging$
DECLARE
  fixture RECORD;
BEGIN
  IF current_database() <> 'neondb'
    OR (SELECT COUNT(*) FROM agency_clients) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM agency_clients
      WHERE id = '10000000-0000-4000-8000-000000000001'
        AND name = 'Page Studio Synthetic Staging Client'
    )
    OR (SELECT COUNT(*) FROM team_members) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM team_members
      WHERE id = '10000000-0000-4000-8000-000000000002'
        AND name = 'Page Studio Staging Owner'
    )
    OR EXISTS (SELECT 1 FROM client_users)
    OR EXISTS (SELECT 1 FROM xero_org_connection)
  THEN
    RAISE EXCEPTION 'Refusing fixture creation: expected isolated unseeded Page Studio staging database';
  END IF;

  FOR fixture IN SELECT * FROM (VALUES
    ('a', '20000000-0000-4000-8000-000000000101'::uuid,
      '30000000-0000-4000-8000-000000000101'::uuid,
      '40000000-0000-4000-8000-000000000101'::uuid,
      '50000000-0000-4000-8000-000000000101'::uuid),
    ('b', '20000000-0000-4000-8000-000000000102'::uuid,
      '30000000-0000-4000-8000-000000000102'::uuid,
      '40000000-0000-4000-8000-000000000102'::uuid,
      '50000000-0000-4000-8000-000000000102'::uuid)
  ) AS fixtures(label, client_id, user_id, entitlement_id, site_id)
  LOOP
    INSERT INTO agency_clients (id, name, billing_type, is_active, notes)
    VALUES (fixture.client_id, 'Page Studio Synthetic Booking Client ' || upper(fixture.label),
      'project', true, 'Isolated staging acceptance fixture; no customer or billable service');

    INSERT INTO client_users (id, client_id, email, name, role, status,
      email_verified, email_notifications, timezone)
    VALUES (fixture.user_id, fixture.client_id,
      'page-studio-staging-' || fixture.label || '@example.invalid',
      'Page Studio Synthetic Editor ' || upper(fixture.label), 'viewer', 'active',
      true, false, 'Australia/Melbourne');

    INSERT INTO page_studio_entitlements (id, tenant_id, client_id, status,
      plan_key, portal_creation_enabled, plan_metadata)
    VALUES (fixture.entitlement_id, 'tenant_page_studio_staging', fixture.client_id,
      'trial', 'synthetic_staging_acceptance', false,
      '{"allowedModules":["bookings"],"synthetic":true}'::jsonb);

    INSERT INTO page_studio_sites (id, tenant_id, client_id, entitlement_id,
      name, route, starter_version, status)
    VALUES (fixture.site_id, 'tenant_page_studio_staging', fixture.client_id,
      fixture.entitlement_id, 'Page Studio Synthetic Booking Site ' || upper(fixture.label),
      'synthetic-booking-' || fixture.label, 'synthetic-staging-v1', 'draft');

    INSERT INTO page_studio_site_memberships (tenant_id, client_id, site_id, user_id, role)
    VALUES ('tenant_page_studio_staging', fixture.client_id, fixture.site_id,
      fixture.user_id, 'editor');
  END LOOP;

  INSERT INTO client_users (id, client_id, email, name, role, status,
    email_verified, email_notifications, timezone)
  VALUES ('30000000-0000-4000-8000-000000000103',
    '20000000-0000-4000-8000-000000000101',
    'page-studio-staging-viewer@example.invalid', 'Page Studio Synthetic Viewer A',
    'viewer', 'active', true, false, 'Australia/Melbourne');

  INSERT INTO page_studio_site_memberships (tenant_id, client_id, site_id, user_id, role)
  VALUES ('tenant_page_studio_staging', '20000000-0000-4000-8000-000000000101',
    '50000000-0000-4000-8000-000000000101',
    '30000000-0000-4000-8000-000000000103', 'viewer');
END;
$staging$;
