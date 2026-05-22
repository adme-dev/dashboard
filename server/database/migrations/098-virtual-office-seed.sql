-- =============================================================================
-- Dev/staging seed: one office with starter floor plan + chat_channels rows
-- Safe to run multiple times (idempotent)
-- =============================================================================
-- Substitutions vs plan SQL:
--   users          → team_members  (canonical staff table)
--   u.role         → u.user_role   (typed enum: owner|admin|member|lead|...)
--   ON CONFLICT DO NOTHING on offices → INSERT WHERE NOT EXISTS (no unique on name)
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_office_id uuid;
  v_zone_lobby uuid;
  v_zone_mtg_a uuid;
  v_zone_mtg_b uuid;
  v_zone_mtg_c uuid;
  v_zone_mtg_d uuid;
  v_zone_focus_1 uuid;
  v_zone_focus_2 uuid;
BEGIN
  -- Office (idempotent via WHERE NOT EXISTS — no unique constraint on name)
  INSERT INTO offices (name, layout)
  SELECT 'XeroFlow HQ', jsonb_build_object('width', 1200, 'height', 800, 'theme', 'light')
  WHERE NOT EXISTS (SELECT 1 FROM offices WHERE name = 'XeroFlow HQ');

  SELECT id INTO v_office_id FROM offices WHERE name = 'XeroFlow HQ';

  -- Zones (idempotent on (office_id, slug))
  INSERT INTO office_zones (office_id, slug, name, zone_type, position, capacity, acl) VALUES
    (v_office_id, 'lobby',    'Lobby',         'lobby',   '{"x":50,"y":50,"w":300,"h":200}'::jsonb,   50, '{"public_lobby":true}'::jsonb),
    (v_office_id, 'mtg-a',   'Meeting Room A', 'meeting', '{"x":400,"y":50,"w":250,"h":200}'::jsonb,  12, '{}'::jsonb),
    (v_office_id, 'mtg-b',   'Meeting Room B', 'meeting', '{"x":700,"y":50,"w":250,"h":200}'::jsonb,  12, '{}'::jsonb),
    (v_office_id, 'mtg-c',   'Meeting Room C', 'meeting', '{"x":400,"y":300,"w":250,"h":200}'::jsonb, 12, '{}'::jsonb),
    (v_office_id, 'mtg-d',   'Meeting Room D', 'meeting', '{"x":700,"y":300,"w":250,"h":200}'::jsonb, 12, '{}'::jsonb),
    (v_office_id, 'focus-1', 'Focus Room 1',   'focus',   '{"x":50,"y":300,"w":150,"h":150}'::jsonb,  4,  '{}'::jsonb),
    (v_office_id, 'focus-2', 'Focus Room 2',   'focus',   '{"x":220,"y":300,"w":150,"h":150}'::jsonb, 4,  '{}'::jsonb)
  ON CONFLICT (office_id, slug) DO NOTHING;

  -- Capture zone ids for chat_channels seeding
  SELECT id INTO v_zone_lobby   FROM office_zones WHERE office_id = v_office_id AND slug = 'lobby';
  SELECT id INTO v_zone_mtg_a   FROM office_zones WHERE office_id = v_office_id AND slug = 'mtg-a';
  SELECT id INTO v_zone_mtg_b   FROM office_zones WHERE office_id = v_office_id AND slug = 'mtg-b';
  SELECT id INTO v_zone_mtg_c   FROM office_zones WHERE office_id = v_office_id AND slug = 'mtg-c';
  SELECT id INTO v_zone_mtg_d   FROM office_zones WHERE office_id = v_office_id AND slug = 'mtg-d';
  SELECT id INTO v_zone_focus_1 FROM office_zones WHERE office_id = v_office_id AND slug = 'focus-1';
  SELECT id INTO v_zone_focus_2 FROM office_zones WHERE office_id = v_office_id AND slug = 'focus-2';

  -- Pre-create chat_channels for each zone (Phase 1c will write into these)
  -- slug is globally unique in chat_channels; use 'office-<zone-slug>' prefix
  INSERT INTO chat_channels (name, slug, type, external_id, created_by)
  SELECT
    z.name,
    'office-' || z.slug,
    'office_zone',
    z.id,
    (SELECT id FROM team_members WHERE user_role = 'owner' ORDER BY created_at ASC LIMIT 1)
  FROM office_zones z
  WHERE z.office_id = v_office_id
    AND NOT EXISTS (
      SELECT 1 FROM chat_channels c
      WHERE c.type = 'office_zone' AND c.external_id = z.id
    );

  -- Add all active staff as office members
  INSERT INTO office_members (office_id, user_id, role)
  SELECT
    v_office_id,
    u.id,
    CASE WHEN u.user_role IN ('owner', 'admin') THEN 'admin' ELSE 'member' END
  FROM team_members u
  WHERE u.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM office_members om
      WHERE om.office_id = v_office_id AND om.user_id = u.id
    );

END $$;

COMMIT;
