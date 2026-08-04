-- 341_ai_pilot_task_evidence.sql
-- Durable, prompt-free evidence for controlled representative pilot UAT.

CREATE TABLE IF NOT EXISTS ai_pilot_task_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  turn_id UUID NOT NULL UNIQUE,
  pack_release_id UUID NOT NULL REFERENCES ai_pack_releases(id) ON DELETE RESTRICT,
  pack_version_id UUID NOT NULL REFERENCES ai_capability_pack_versions(id) ON DELETE RESTRICT,
  eval_suite_version_id UUID NOT NULL REFERENCES ai_eval_suite_versions(id) ON DELETE RESTRICT,
  eval_case_id UUID NOT NULL REFERENCES ai_eval_cases(id) ON DELETE RESTRICT,
  pilot_episode_audit_id UUID NOT NULL REFERENCES ai_catalog_audit_events(id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  issuer_user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE RESTRICT,
  issuer_reason TEXT NOT NULL CHECK (char_length(btrim(issuer_reason)) BETWEEN 10 AND 2000),
  state TEXT NOT NULL DEFAULT 'issued' CHECK (state IN ('issued', 'started', 'terminal', 'assessed')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  terminal_at TIMESTAMPTZ,
  assessed_at TIMESTAMPTZ,
  terminal_outcome TEXT CHECK (terminal_outcome IN ('success', 'error', 'caller_unavailable', 'link_failed')),
  terminal_error_code TEXT CHECK (terminal_error_code IS NULL OR char_length(terminal_error_code) <= 120),
  fallback_used BOOLEAN,
  cost_usd_micros BIGINT CHECK (cost_usd_micros IS NULL OR cost_usd_micros >= 0),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  assistant_message_id UUID REFERENCES ai_messages(id) ON DELETE RESTRICT,
  enforcement_scope_respected BOOLEAN,
  enforcement_approval_boundary_respected BOOLEAN,
  enforcement_prohibited_effects_count INTEGER CHECK (enforcement_prohibited_effects_count IS NULL OR enforcement_prohibited_effects_count >= 0),
  assessor_user_id UUID REFERENCES team_members(id) ON DELETE RESTRICT,
  assessor_reason TEXT CHECK (assessor_reason IS NULL OR char_length(btrim(assessor_reason)) BETWEEN 10 AND 2000),
  scope_respected BOOLEAN,
  approval_boundary_respected BOOLEAN,
  prohibited_effect_observed BOOLEAN,
  freshness_respected BOOLEAN,
  fabrication_observed BOOLEAN,
  credential_leak_observed BOOLEAN,
  UNIQUE (pack_release_id, pilot_episode_audit_id, eval_case_id, actor_user_id, turn_id),
  CHECK (assessor_user_id IS NULL OR (assessor_user_id <> issuer_user_id AND assessor_user_id <> actor_user_id)),
  CHECK (terminal_outcome IS DISTINCT FROM 'success' OR assistant_message_id IS NOT NULL),
  CHECK (started_at IS NULL OR issued_at <= started_at),
  CHECK (terminal_at IS NULL OR (started_at IS NOT NULL AND started_at <= terminal_at)),
  CHECK (assessed_at IS NULL OR (terminal_at IS NOT NULL AND terminal_at <= assessed_at)),
  CHECK (
    (state = 'issued' AND started_at IS NULL AND terminal_at IS NULL AND assessed_at IS NULL)
    OR (state = 'started' AND started_at IS NOT NULL AND terminal_at IS NULL AND assessed_at IS NULL)
    OR (state = 'terminal' AND started_at IS NOT NULL AND terminal_at IS NOT NULL AND terminal_outcome IS NOT NULL AND assessed_at IS NULL)
    OR (state = 'assessed' AND started_at IS NOT NULL AND terminal_at IS NOT NULL AND terminal_outcome IS NOT NULL
        AND assessed_at IS NOT NULL AND assessor_user_id IS NOT NULL AND assessor_reason IS NOT NULL
        AND scope_respected IS NOT NULL AND approval_boundary_respected IS NOT NULL
        AND prohibited_effect_observed IS NOT NULL AND freshness_respected IS NOT NULL
        AND fabrication_observed IS NOT NULL AND credential_leak_observed IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_pilot_task_evidence_release_episode
  ON ai_pilot_task_evidence(pack_release_id, pilot_episode_audit_id, issued_at);
CREATE INDEX IF NOT EXISTS idx_ai_pilot_task_evidence_message
  ON ai_pilot_task_evidence(assistant_message_id) WHERE assistant_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_ai_pilot_task_evidence_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  valid_identity BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pilot evidence is append-only';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1
        FROM ai_pack_releases release
        JOIN ai_capability_packs pack ON pack.id = release.pack_id
        JOIN ai_eval_runs run ON run.id = release.evaluation_run_id
        JOIN ai_eval_cases eval_case ON eval_case.id = NEW.eval_case_id
        JOIN LATERAL (
          SELECT event.id
            FROM ai_catalog_audit_events event
           WHERE event.entity_type = 'pack' AND event.entity_id = pack.id
             AND event.action = 'pilot' AND event.next_version_id = NEW.pack_version_id
           ORDER BY event.created_at DESC, event.id DESC LIMIT 1
        ) latest_audit ON latest_audit.id = NEW.pilot_episode_audit_id
        JOIN ai_conversations conversation ON conversation.id = NEW.conversation_id
          AND conversation.user_id = NEW.actor_user_id AND conversation.is_archived = FALSE
        JOIN ai_release_pilot_members pilot ON pilot.release_kind = 'pack'
          AND pilot.pack_release_id = release.id AND pilot.team_member_id = NEW.actor_user_id
          AND pilot.assigned_at <= NEW.issued_at
          AND (pilot.revoked_at IS NULL OR pilot.revoked_at > NEW.issued_at)
        JOIN team_members member ON member.id = NEW.actor_user_id AND member.is_active = TRUE
        JOIN department_members department_member ON department_member.department_id = release.department_id
          AND department_member.team_member_id = NEW.actor_user_id
       WHERE release.id = NEW.pack_release_id
         AND release.release_state = 'pilot' AND release.rollout_scope = 'pilot'
         AND release.pack_version_id = NEW.pack_version_id
         AND run.pack_version_id = NEW.pack_version_id
         AND run.eval_suite_version_id = NEW.eval_suite_version_id
         AND run.status = 'completed' AND run.gate_passed = TRUE
         AND eval_case.eval_suite_version_id = NEW.eval_suite_version_id
         AND eval_case.department_id = release.department_id
    ) INTO valid_identity;
    IF NOT valid_identity THEN RAISE EXCEPTION 'pilot evidence identity is invalid'; END IF;
    RETURN NEW;
  END IF;

  IF (NEW.request_id, NEW.turn_id, NEW.pack_release_id, NEW.pack_version_id,
      NEW.eval_suite_version_id, NEW.eval_case_id, NEW.pilot_episode_audit_id, NEW.conversation_id,
      NEW.actor_user_id, NEW.issuer_user_id, NEW.issuer_reason, NEW.issued_at)
     IS DISTINCT FROM
     (OLD.request_id, OLD.turn_id, OLD.pack_release_id, OLD.pack_version_id,
      OLD.eval_suite_version_id, OLD.eval_case_id, OLD.pilot_episode_audit_id, OLD.conversation_id,
      OLD.actor_user_id, OLD.issuer_user_id, OLD.issuer_reason, OLD.issued_at) THEN
    RAISE EXCEPTION 'pilot evidence identity is immutable';
  END IF;
  IF OLD.state = 'assessed' THEN
    IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'assessed pilot evidence is immutable'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.state = 'issued' AND NEW.state NOT IN ('issued', 'started') THEN RAISE EXCEPTION 'invalid pilot evidence transition'; END IF;
  IF OLD.state = 'started' AND NEW.state NOT IN ('started', 'terminal') THEN RAISE EXCEPTION 'invalid pilot evidence transition'; END IF;
  IF OLD.state = 'terminal' AND NEW.state NOT IN ('terminal', 'assessed') THEN RAISE EXCEPTION 'invalid pilot evidence transition'; END IF;
  IF OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at THEN RAISE EXCEPTION 'pilot evidence start is immutable'; END IF;
  IF OLD.terminal_at IS NOT NULL AND (NEW.terminal_at, NEW.terminal_outcome, NEW.assistant_message_id)
     IS DISTINCT FROM (OLD.terminal_at, OLD.terminal_outcome, OLD.assistant_message_id) THEN
    RAISE EXCEPTION 'pilot evidence terminal result is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_pilot_task_evidence_transition ON ai_pilot_task_evidence;
CREATE TRIGGER trg_ai_pilot_task_evidence_transition
  BEFORE INSERT OR UPDATE OR DELETE ON ai_pilot_task_evidence
  FOR EACH ROW EXECUTE FUNCTION enforce_ai_pilot_task_evidence_transition();
