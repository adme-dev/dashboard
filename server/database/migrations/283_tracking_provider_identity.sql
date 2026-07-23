-- Bind signed provider events to the exact Podium tenant and locations
-- configured for each tracking site. Existing sites remain disabled for
-- confirmed Podium leads until an administrator completes this allowlist.

UPDATE tracking_sites
SET provider_tracking = jsonb_set(
  jsonb_set(
    provider_tracking,
    '{podium,organizationUid}',
    COALESCE(provider_tracking->'podium'->'organizationUid', 'null'::jsonb),
    TRUE
  ),
  '{podium,locationUids}',
  COALESCE(provider_tracking->'podium'->'locationUids', '[]'::jsonb),
  TRUE
);

ALTER TABLE tracking_sites
  DROP CONSTRAINT IF EXISTS tracking_sites_provider_tracking_shape;

ALTER TABLE tracking_sites
  ADD CONSTRAINT tracking_sites_provider_tracking_shape CHECK (
    jsonb_typeof(provider_tracking) = 'object'
    AND jsonb_typeof(provider_tracking->'podium') = 'object'
    AND jsonb_typeof(provider_tracking->'xtime') = 'object'
    AND jsonb_typeof(provider_tracking->'podium'->'interactions') = 'boolean'
    AND jsonb_typeof(provider_tracking->'podium'->'confirmedLeads') = 'boolean'
    AND jsonb_typeof(provider_tracking->'podium'->'organizationUid') IN ('null', 'string')
    AND jsonb_typeof(provider_tracking->'podium'->'locationUids') = 'array'
    AND jsonb_typeof(provider_tracking->'xtime'->'interactions') = 'boolean'
    AND jsonb_typeof(provider_tracking->'xtime'->'confirmedLeads') = 'boolean'
    AND (
      (provider_tracking->'podium'->>'confirmedLeads')::boolean = FALSE
      OR (
        NULLIF(provider_tracking->'podium'->>'organizationUid', '') IS NOT NULL
        AND jsonb_array_length(provider_tracking->'podium'->'locationUids') > 0
      )
    )
  );

-- Reject malformed pre-existing allowlist entries before the new shape is
-- treated as authoritative. Application writes additionally validate UUIDs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tracking_sites s
    CROSS JOIN LATERAL jsonb_array_elements_text(
      s.provider_tracking->'podium'->'locationUids'
    ) AS location_uid(value)
    WHERE location_uid.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'tracking_sites contains malformed Podium location UIDs';
  END IF;
END $$;

COMMENT ON COLUMN tracking_sites.provider_tracking IS
  'Per-site provider controls. Podium confirmed leads require exact organizationUid and locationUids allowlisting.';
