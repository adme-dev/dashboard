-- Explicit, revocable pilot membership for governed AI capability releases.
-- Additive and dormant: this migration enrolls nobody and changes no release state.

ALTER TABLE ai_pack_releases
  ADD COLUMN IF NOT EXISTS rollout_scope TEXT NOT NULL DEFAULT 'department';

ALTER TABLE ai_capability_releases
  ADD COLUMN IF NOT EXISTS rollout_scope TEXT NOT NULL DEFAULT 'department';

UPDATE ai_pack_releases
   SET rollout_scope = 'pilot'
 WHERE release_state = 'pilot' AND rollout_scope <> 'pilot';

UPDATE ai_capability_releases
   SET rollout_scope = 'pilot'
 WHERE release_state = 'pilot' AND rollout_scope <> 'pilot';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_pack_releases_rollout_scope_check'
  ) THEN
    ALTER TABLE ai_pack_releases ADD CONSTRAINT ai_pack_releases_rollout_scope_check CHECK (
      rollout_scope IN ('pilot', 'department')
      AND (
        (release_state = 'pilot' AND rollout_scope = 'pilot')
        OR (release_state = 'active' AND rollout_scope = 'department')
        OR release_state NOT IN ('pilot', 'active')
      )
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_capability_releases_rollout_scope_check'
  ) THEN
    ALTER TABLE ai_capability_releases ADD CONSTRAINT ai_capability_releases_rollout_scope_check CHECK (
      rollout_scope IN ('pilot', 'department')
      AND (
        (release_state = 'pilot' AND rollout_scope = 'pilot')
        OR (release_state = 'active' AND rollout_scope = 'department')
        OR release_state NOT IN ('pilot', 'active')
      )
    );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_pack_releases_id_department
  ON ai_pack_releases(id, department_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_capability_releases_id_department
  ON ai_capability_releases(id, department_id);

CREATE TABLE IF NOT EXISTS ai_release_pilot_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_kind TEXT NOT NULL CHECK (release_kind IN ('pack', 'capability')),
  pack_release_id UUID,
  capability_release_id UUID,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  assignment_reason TEXT NOT NULL CHECK (char_length(btrim(assignment_reason)) BETWEEN 1 AND 2000),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES team_members(id) ON DELETE RESTRICT,
  revocation_reason TEXT CHECK (
    revocation_reason IS NULL OR char_length(btrim(revocation_reason)) BETWEEN 1 AND 2000
  ),
  CHECK (
    (release_kind = 'pack' AND pack_release_id IS NOT NULL AND capability_release_id IS NULL)
    OR
    (release_kind = 'capability' AND capability_release_id IS NOT NULL AND pack_release_id IS NULL)
  ),
  CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR
    (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)
  ),
  FOREIGN KEY (pack_release_id, department_id)
    REFERENCES ai_pack_releases(id, department_id) ON DELETE RESTRICT,
  FOREIGN KEY (capability_release_id, department_id)
    REFERENCES ai_capability_releases(id, department_id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION validate_ai_release_pilot_department_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
    FROM department_members
   WHERE department_id = NEW.department_id
     AND team_member_id = NEW.team_member_id
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pilot member must belong to the release department'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_release_pilot_department_member ON ai_release_pilot_members;
CREATE TRIGGER trg_ai_release_pilot_department_member
  BEFORE INSERT OR UPDATE OF department_id, team_member_id
  ON ai_release_pilot_members
  FOR EACH ROW
  EXECUTE FUNCTION validate_ai_release_pilot_department_member();

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_pack_release_live_pilot_member
  ON ai_release_pilot_members(pack_release_id, team_member_id)
  WHERE release_kind = 'pack' AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_capability_release_live_pilot_member
  ON ai_release_pilot_members(capability_release_id, team_member_id)
  WHERE release_kind = 'capability' AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_release_pilot_member_runtime
  ON ai_release_pilot_members(team_member_id, department_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_release_pilot_members_history
  ON ai_release_pilot_members(department_id, assigned_at DESC);
