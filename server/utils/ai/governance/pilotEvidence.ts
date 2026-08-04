import type { H3Event } from 'h3'
import { queryOne } from '~~/server/utils/db'

interface PilotEvidenceDb { queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> }
const defaultDb: PilotEvidenceDb = { queryOne }

export class PilotEvidenceError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 409) {
    super(code)
    this.name = 'PilotEvidenceError'
  }
}

export interface IssuedPilotUatEvidence {
  id: string
  requestId: string
  turnId: string
  prompt: string
  packKey: string
  state: 'issued' | 'started' | 'terminal' | 'assessed'
  terminalOutcome: 'success' | 'error' | 'caller_unavailable' | 'link_failed' | null
}

const ISSUE_SQL = `
WITH replayed AS (
  SELECT evidence.*, evaluation_case.input ->> 'prompt' AS prompt, pack.pack_key
    FROM ai_pilot_task_evidence evidence
    JOIN ai_pack_releases release ON release.id = evidence.pack_release_id
    JOIN ai_capability_packs pack ON pack.id = release.pack_id
    JOIN ai_eval_cases evaluation_case ON evaluation_case.id = evidence.eval_case_id
   WHERE evidence.request_id = $1::uuid AND evidence.pack_release_id = $3::uuid
     AND evidence.eval_case_id = $4::uuid AND evidence.actor_user_id = $5::uuid
     AND evidence.issuer_user_id = $6::uuid AND evidence.conversation_id = $7::uuid
     AND evidence.issuer_reason = $8::text
   LIMIT 1
), admitted AS (
  SELECT release.id AS pack_release_id, release.pack_version_id,
         evaluation.eval_suite_version_id, evaluation_case.id AS eval_case_id,
         audit.id AS pilot_episode_audit_id, pilot.team_member_id AS actor_user_id,
         evaluation_case.input ->> 'prompt' AS prompt, pack.pack_key
    FROM ai_pack_releases release
    JOIN ai_capability_packs pack ON pack.id = release.pack_id
    JOIN ai_eval_runs evaluation ON evaluation.id = release.evaluation_run_id
      AND evaluation.pack_version_id = release.pack_version_id
      AND evaluation.status = 'completed' AND evaluation.gate_passed = TRUE
    JOIN ai_eval_cases evaluation_case ON evaluation_case.id = $4::uuid
      AND evaluation_case.eval_suite_version_id = evaluation.eval_suite_version_id
      AND evaluation_case.department_id = release.department_id
    JOIN LATERAL (
      SELECT event.id FROM ai_catalog_audit_events event
       WHERE event.entity_type = 'pack' AND event.entity_id = pack.id
         AND event.action = 'pilot' AND event.next_version_id = release.pack_version_id
       ORDER BY event.created_at DESC, event.id DESC LIMIT 1
    ) audit ON TRUE
    JOIN ai_release_pilot_members pilot ON pilot.release_kind = 'pack'
      AND pilot.pack_release_id = release.id AND pilot.team_member_id = $5::uuid
      AND pilot.assigned_at <= NOW() AND (pilot.revoked_at IS NULL OR pilot.revoked_at > NOW())
    JOIN team_members member ON member.id = pilot.team_member_id AND member.is_active = TRUE
    JOIN department_members department_member ON department_member.department_id = release.department_id
      AND department_member.team_member_id = pilot.team_member_id
    JOIN ai_conversations conversation ON conversation.id = $7::uuid
      AND conversation.user_id = pilot.team_member_id AND conversation.is_archived = FALSE
   WHERE release.id = $3::uuid AND release.release_state = 'pilot' AND release.rollout_scope = 'pilot'
), inserted AS (
  INSERT INTO ai_pilot_task_evidence (
    request_id, turn_id, pack_release_id, pack_version_id, eval_suite_version_id,
    eval_case_id, pilot_episode_audit_id, conversation_id, actor_user_id, issuer_user_id, issuer_reason
  )
  SELECT $1::uuid, $2::uuid, pack_release_id, pack_version_id, eval_suite_version_id,
         eval_case_id, pilot_episode_audit_id, $7::uuid, actor_user_id, $6::uuid, $8::text
    FROM admitted
  ON CONFLICT (request_id) DO UPDATE SET request_id = EXCLUDED.request_id
    WHERE ai_pilot_task_evidence.pack_release_id = EXCLUDED.pack_release_id
      AND ai_pilot_task_evidence.eval_case_id = EXCLUDED.eval_case_id
      AND ai_pilot_task_evidence.conversation_id = EXCLUDED.conversation_id
      AND ai_pilot_task_evidence.actor_user_id = EXCLUDED.actor_user_id
      AND ai_pilot_task_evidence.issuer_user_id = EXCLUDED.issuer_user_id
      AND ai_pilot_task_evidence.issuer_reason = EXCLUDED.issuer_reason
  RETURNING *
)
SELECT replayed.id, replayed.request_id, replayed.turn_id, replayed.prompt, replayed.pack_key,
       replayed.state, replayed.terminal_outcome
  FROM replayed
UNION ALL
SELECT inserted.id, inserted.request_id, inserted.turn_id, admitted.prompt, admitted.pack_key,
       inserted.state, inserted.terminal_outcome
  FROM inserted JOIN admitted ON admitted.pack_release_id = inserted.pack_release_id
 WHERE NOT EXISTS (SELECT 1 FROM replayed)
LIMIT 1`

function mapIssued(row: any): IssuedPilotUatEvidence {
  return {
    id: row.id, requestId: row.request_id, turnId: row.turn_id, prompt: row.prompt, packKey: row.pack_key,
    state: row.state ?? 'issued', terminalOutcome: row.terminal_outcome ?? null
  }
}

export async function issuePilotUatEvidence(input: {
  requestId: string, turnId: string, releaseId: string, caseId: string,
  actorUserId: string, issuerUserId: string, conversationId: string, reason: string
}, db: PilotEvidenceDb = defaultDb): Promise<IssuedPilotUatEvidence> {
  const row = await db.queryOne<any>(ISSUE_SQL, [input.requestId, input.turnId, input.releaseId, input.caseId, input.actorUserId, input.issuerUserId, input.conversationId, input.reason])
  if (!row) throw new PilotEvidenceError('pilot_evidence_not_admitted')
  return mapIssued(row)
}

async function acknowledged<T>(db: PilotEvidenceDb, sql: string, params: unknown[]): Promise<T> {
  const row = await db.queryOne<T>(sql, params)
  if (!row) throw new PilotEvidenceError('pilot_evidence_transition_failed')
  return row
}

export function markPilotUatStarted(evidenceId: string, turnId: string, db: PilotEvidenceDb = defaultDb) {
  return acknowledged<any>(db, `UPDATE ai_pilot_task_evidence SET state = 'started', started_at = NOW()
    WHERE id = $1::uuid AND turn_id = $2::uuid AND state = 'issued'
    RETURNING id, state`, [evidenceId, turnId])
}

export function terminalizePilotUatEvidence(input: {
  evidenceId: string, turnId: string, assistantMessageId: string | null,
  outcome: 'success' | 'error' | 'caller_unavailable' | 'link_failed', errorCode?: string | null
}, db: PilotEvidenceDb = defaultDb) {
  return acknowledged<any>(db, `WITH telemetry AS (
      SELECT CASE WHEN COUNT(*) = 0 OR COUNT(*) FILTER (WHERE estimated_cost_usd IS NULL) > 0 THEN NULL
                  ELSE ROUND(COALESCE(SUM(estimated_cost_usd), 0) * 1000000)::bigint END AS cost_usd_micros,
             CASE WHEN COUNT(*) = 0 OR COUNT(*) FILTER (WHERE latency_ms IS NULL) > 0 THEN NULL
                  ELSE COALESCE(SUM(latency_ms), 0)::integer END AS latency_ms,
             BOOL_OR(fallback_used) AS fallback_used
        FROM ai_invocations
       WHERE metadata ->> 'pilotEvidenceId' = $1::text AND metadata ->> 'turnId' = $2::text
    )
    UPDATE ai_pilot_task_evidence evidence SET
      state = 'terminal', terminal_at = NOW(), terminal_outcome = $4,
      terminal_error_code = $5, assistant_message_id = $3::uuid,
      cost_usd_micros = telemetry.cost_usd_micros, latency_ms = telemetry.latency_ms,
      fallback_used = COALESCE(telemetry.fallback_used, FALSE),
      enforcement_scope_respected = EXISTS (
         SELECT 1 FROM ai_pack_releases release
         JOIN ai_capability_packs pack ON pack.id = release.pack_id
         JOIN LATERAL (
           SELECT audit.id FROM ai_catalog_audit_events audit
            WHERE audit.entity_type = 'pack' AND audit.entity_id = pack.id
              AND audit.action = 'pilot' AND audit.next_version_id = release.pack_version_id
            ORDER BY audit.created_at DESC, audit.id DESC LIMIT 1
         ) current_episode ON current_episode.id = evidence.pilot_episode_audit_id
         JOIN ai_release_pilot_members pilot ON pilot.pack_release_id = release.id
           AND pilot.release_kind = 'pack' AND pilot.team_member_id = evidence.actor_user_id
           AND pilot.assigned_at <= NOW() AND (pilot.revoked_at IS NULL OR pilot.revoked_at > NOW())
         JOIN team_members member ON member.id = pilot.team_member_id AND member.is_active = TRUE
         JOIN department_members department_member ON department_member.department_id = release.department_id
           AND department_member.team_member_id = evidence.actor_user_id
         WHERE release.id = evidence.pack_release_id AND release.pack_version_id = evidence.pack_version_id
           AND release.release_state = 'pilot' AND release.rollout_scope = 'pilot'
      ),
      enforcement_approval_boundary_respected = EXISTS (
        SELECT 1 FROM ai_capability_pack_versions pack_version
         WHERE pack_version.id = evidence.pack_version_id
           AND NOT EXISTS (
             SELECT 1 FROM ai_pack_version_capabilities pack_capability
             JOIN ai_capability_versions capability ON capability.id = pack_capability.capability_version_id
             LEFT JOIN ai_capability_tool_bindings binding ON binding.capability_version_id = capability.id
              WHERE pack_capability.pack_version_id = pack_version.id
                AND (capability.approval_mode <> 'none' OR binding.access_mode = 'propose')
           )
           AND NOT EXISTS (
             SELECT 1 FROM ai_pending_actions pending
              WHERE pending.conversation_id = evidence.conversation_id
                AND pending.user_id = evidence.actor_user_id
                AND pending.created_at >= evidence.started_at AND pending.created_at <= NOW()
           )
      ),
      enforcement_prohibited_effects_count = (
        SELECT COUNT(*)::integer FROM (
          SELECT pending.id
            FROM ai_pending_actions pending
           WHERE pending.conversation_id = evidence.conversation_id
             AND pending.user_id = evidence.actor_user_id
             AND pending.created_at >= evidence.started_at AND pending.created_at <= NOW()
             AND pending.status = 'executed'
          UNION
          SELECT action.pending_id
            FROM ai_action_audit action
            JOIN ai_pending_actions pending ON pending.id = action.pending_id
           WHERE pending.conversation_id = evidence.conversation_id
             AND action.user_id = evidence.actor_user_id
             AND action.created_at >= evidence.started_at AND action.created_at <= NOW()
             AND action.outcome IN ('executed', 'rolled_back')
        ) prohibited_effect
      )
    FROM telemetry
    WHERE evidence.id = $1::uuid AND evidence.turn_id = $2::uuid AND evidence.state = 'started'
      AND ($3::uuid IS NULL OR EXISTS (
        SELECT 1 FROM ai_messages message JOIN ai_conversations conversation ON conversation.id = message.conversation_id
         WHERE message.id = $3::uuid AND message.role = 'assistant'
           AND conversation.id = evidence.conversation_id AND conversation.user_id = evidence.actor_user_id
      ))
    RETURNING evidence.id, evidence.state, evidence.terminal_outcome`, [input.evidenceId, input.turnId, input.assistantMessageId, input.outcome, input.errorCode ?? null])
}

export function assessPilotUatEvidence(input: {
  evidenceId: string, assessorUserId: string, reason: string,
  scopeRespected: boolean, approvalBoundaryRespected: boolean,
  prohibitedEffectObserved: boolean, freshnessRespected: boolean,
  fabricationObserved: boolean, credentialLeakObserved: boolean
}, db: PilotEvidenceDb = defaultDb) {
  return acknowledged<any>(db, `UPDATE ai_pilot_task_evidence SET
      state = 'assessed', assessed_at = NOW(), assessor_user_id = $2::uuid, assessor_reason = $3,
      scope_respected = $4, approval_boundary_respected = $5, prohibited_effect_observed = $6,
      freshness_respected = $7, fabrication_observed = $8, credential_leak_observed = $9
    WHERE id = $1::uuid AND state = 'terminal'
      AND $2::uuid <> issuer_user_id AND $2::uuid <> actor_user_id
    RETURNING id, state`, [input.evidenceId, input.assessorUserId, input.reason, input.scopeRespected,
    input.approvalBoundaryRespected, input.prohibitedEffectObserved, input.freshnessRespected,
    input.fabricationObserved, input.credentialLeakObserved])
}

function personaForPack(packKey: string): string {
  if (packKey === 'paid_media_read_draft') return 'media_buyer'
  if (packKey === 'finance_read_draft' || packKey === 'bookkeeping_read_draft') return 'finance'
  if (packKey === 'account_management_read_draft') return 'account'
  return 'general'
}

export async function runControlledPilotUat(input: {
  requestId: string, releaseId: string, evaluationCaseId: string, actorUserId: string,
  issuerUserId: string, conversationId: string, reason: string
}, event: H3Event, deps: {
  processMessage?: typeof import('~~/server/utils/aiChatEngine')['processUserMessage']
  db?: PilotEvidenceDb
} = {}) {
  const turnId = crypto.randomUUID()
  const evidence = await issuePilotUatEvidence({ ...input, turnId, caseId: input.evaluationCaseId }, deps.db)
  if (evidence.state === 'terminal' || evidence.state === 'assessed') {
    return { evidenceId: evidence.id, state: 'terminal' as const, terminalOutcome: evidence.terminalOutcome! }
  }
  if (evidence.state === 'started') throw new PilotEvidenceError('pilot_evidence_in_progress')
  await markPilotUatStarted(evidence.id, evidence.turnId, deps.db)
  try {
    const processMessage = deps.processMessage ?? (await import('~~/server/utils/aiChatEngine')).processUserMessage
    const result = await processMessage(input.conversationId, input.actorUserId, '', evidence.prompt, event, undefined, undefined, personaForPack(evidence.packKey), undefined, {
      evidenceId: evidence.id,
      turnId: evidence.turnId,
      releaseId: input.releaseId
    })
    await terminalizePilotUatEvidence({ evidenceId: evidence.id, turnId: evidence.turnId, assistantMessageId: result.message.id, outcome: result.message.isError ? 'error' : 'success' }, deps.db)
    return { evidenceId: evidence.id, state: 'terminal' as const, terminalOutcome: result.message.isError ? 'error' as const : 'success' as const }
  } catch (error) {
    const code = error instanceof Error && error.name === 'AiInvocationLinkError' ? 'message_link_failed' : 'assistant_turn_failed'
    const outcome = code === 'message_link_failed' ? 'link_failed' as const : 'error' as const
    await terminalizePilotUatEvidence({ evidenceId: evidence.id, turnId: evidence.turnId, assistantMessageId: null, outcome, errorCode: code }, deps.db)
    throw error
  }
}
