-- 343_ai_pilot_task_evidence_state_progression.sql
-- Enforce issued-only inserts and strict per-transition column allowlists.

CREATE OR REPLACE FUNCTION enforce_ai_pilot_task_evidence_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  valid_identity BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pilot evidence is append-only';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.state IS DISTINCT FROM 'issued'
       OR ROW(NEW.started_at,
              NEW.terminal_at, NEW.terminal_outcome, NEW.terminal_error_code,
              NEW.fallback_used, NEW.cost_usd_micros, NEW.latency_ms, NEW.assistant_message_id,
              NEW.enforcement_scope_respected, NEW.enforcement_approval_boundary_respected,
              NEW.enforcement_prohibited_effects_count,
              NEW.assessed_at, NEW.assessor_user_id, NEW.assessor_reason,
              NEW.scope_respected, NEW.approval_boundary_respected, NEW.prohibited_effect_observed,
              NEW.freshness_respected, NEW.fabrication_observed, NEW.credential_leak_observed)
          IS DISTINCT FROM
          ROW(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
              NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL) THEN
      RAISE EXCEPTION 'pilot evidence insert must be issued-only';
    END IF;

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

  IF (NEW.id, NEW.request_id, NEW.turn_id, NEW.pack_release_id, NEW.pack_version_id,
      NEW.eval_suite_version_id, NEW.eval_case_id, NEW.pilot_episode_audit_id, NEW.conversation_id,
      NEW.actor_user_id, NEW.issuer_user_id, NEW.issuer_reason, NEW.issued_at)
     IS DISTINCT FROM
     (OLD.id, OLD.request_id, OLD.turn_id, OLD.pack_release_id, OLD.pack_version_id,
      OLD.eval_suite_version_id, OLD.eval_case_id, OLD.pilot_episode_audit_id, OLD.conversation_id,
      OLD.actor_user_id, OLD.issuer_user_id, OLD.issuer_reason, OLD.issued_at) THEN
    RAISE EXCEPTION 'pilot evidence identity is immutable';
  END IF;

  IF NEW.state = OLD.state THEN
    IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'pilot evidence replay must be a no-op'; END IF;
    RETURN NEW;
  END IF;

  IF OLD.state = 'assessed' THEN
    RAISE EXCEPTION 'assessed pilot evidence is immutable';
  END IF;

  IF NEW.state = 'started'
     AND ROW(NEW.terminal_at, NEW.terminal_outcome, NEW.terminal_error_code,
             NEW.fallback_used, NEW.cost_usd_micros, NEW.latency_ms, NEW.assistant_message_id,
             NEW.enforcement_scope_respected, NEW.enforcement_approval_boundary_respected,
             NEW.enforcement_prohibited_effects_count,
             NEW.assessed_at, NEW.assessor_user_id, NEW.assessor_reason,
             NEW.scope_respected, NEW.approval_boundary_respected, NEW.prohibited_effect_observed,
             NEW.freshness_respected, NEW.fabrication_observed, NEW.credential_leak_observed)
         IS DISTINCT FROM
         ROW(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
             NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL) THEN
    RAISE EXCEPTION 'started pilot evidence contains forbidden fields';
  END IF;

  IF NEW.state = 'terminal'
     AND ROW(NEW.assessed_at, NEW.assessor_user_id, NEW.assessor_reason,
             NEW.scope_respected, NEW.approval_boundary_respected, NEW.prohibited_effect_observed,
             NEW.freshness_respected, NEW.fabrication_observed, NEW.credential_leak_observed)
         IS DISTINCT FROM
         ROW(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL) THEN
    RAISE EXCEPTION 'terminal pilot evidence contains assessment fields';
  END IF;

  IF OLD.state = 'issued' AND NEW.state <> 'started' THEN RAISE EXCEPTION 'invalid pilot evidence transition'; END IF;
  IF OLD.state = 'started' AND NEW.state <> 'terminal' THEN RAISE EXCEPTION 'invalid pilot evidence transition'; END IF;
  IF OLD.state = 'terminal' AND NEW.state <> 'assessed' THEN RAISE EXCEPTION 'invalid pilot evidence transition'; END IF;

  IF OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'pilot evidence start is immutable';
  END IF;

  IF OLD.state = 'terminal' AND NEW.state = 'assessed' THEN
    IF ROW(NEW.started_at,
           NEW.terminal_at, NEW.terminal_outcome, NEW.terminal_error_code,
           NEW.fallback_used, NEW.cost_usd_micros, NEW.latency_ms, NEW.assistant_message_id,
           NEW.enforcement_scope_respected, NEW.enforcement_approval_boundary_respected,
           NEW.enforcement_prohibited_effects_count)
       IS DISTINCT FROM
       ROW(OLD.started_at,
           OLD.terminal_at, OLD.terminal_outcome, OLD.terminal_error_code,
           OLD.fallback_used, OLD.cost_usd_micros, OLD.latency_ms, OLD.assistant_message_id,
           OLD.enforcement_scope_respected, OLD.enforcement_approval_boundary_respected,
           OLD.enforcement_prohibited_effects_count) THEN
      RAISE EXCEPTION 'pilot evidence terminal authority is immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_pilot_task_evidence_transition ON ai_pilot_task_evidence;
CREATE TRIGGER trg_ai_pilot_task_evidence_transition
  BEFORE INSERT OR UPDATE OR DELETE ON ai_pilot_task_evidence
  FOR EACH ROW EXECUTE FUNCTION enforce_ai_pilot_task_evidence_transition();
