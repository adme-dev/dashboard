import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assessPilotUatEvidence,
  issuePilotUatEvidence,
  markPilotUatStarted,
  runControlledPilotUat,
  terminalizePilotUatEvidence
} from '~~/server/utils/ai/governance/pilotEvidence'

const ids = {
  requestId: '10000000-0000-4000-8000-000000000001',
  turnId: '10000000-0000-4000-8000-000000000002',
  releaseId: '10000000-0000-4000-8000-000000000003',
  caseId: '10000000-0000-4000-8000-000000000004',
  actorUserId: '10000000-0000-4000-8000-000000000005',
  issuerUserId: '10000000-0000-4000-8000-000000000006',
  evidenceId: '10000000-0000-4000-8000-000000000007',
  messageId: '10000000-0000-4000-8000-000000000008',
  assessorUserId: '10000000-0000-4000-8000-000000000009',
  conversationId: '10000000-0000-4000-8000-000000000010'
}

describe('durable pilot UAT evidence state machine', () => {
  const queryOne = vi.fn()
  beforeEach(() => queryOne.mockReset())

  it('issues only by atomic exact release/suite/case/episode/member/conversation selection and is idempotent by request', async () => {
    queryOne.mockResolvedValue({ id: ids.evidenceId, request_id: ids.requestId, turn_id: ids.turnId, prompt: 'server case', pack_key: 'paid_media_read_draft' })
    const result = await issuePilotUatEvidence({ ...ids, reason: 'Controlled pilot UAT' }, { queryOne })

    expect(result.id).toBe(ids.evidenceId)
    const sql = queryOne.mock.calls[0]![0]
    expect(sql).toContain('INSERT INTO ai_pilot_task_evidence')
    expect(sql).toContain("release.release_state = 'pilot'")
    expect(sql).toContain("event.action = 'pilot'")
    expect(sql).toContain('evaluation_case.input ->> \'prompt\'')
    expect(sql).toContain('ON CONFLICT (request_id) DO UPDATE')
    expect(sql).toContain('conversation.user_id = pilot.team_member_id')
    expect(sql).toContain('WITH replayed AS')
  })

  it('throws when replay inputs conflict or an acknowledged transition updates no row', async () => {
    queryOne.mockResolvedValue(null)
    await expect(issuePilotUatEvidence({ ...ids, reason: 'Controlled pilot UAT' }, { queryOne })).rejects.toMatchObject({ code: 'pilot_evidence_not_admitted' })
    await expect(markPilotUatStarted(ids.evidenceId, ids.turnId, { queryOne })).rejects.toMatchObject({ code: 'pilot_evidence_transition_failed' })
  })

  it('terminalizes from trusted message/invocation facts and records link failure explicitly', async () => {
    queryOne.mockResolvedValue({ id: ids.evidenceId, state: 'terminal', terminal_outcome: 'link_failed' })
    await terminalizePilotUatEvidence({ evidenceId: ids.evidenceId, turnId: ids.turnId, assistantMessageId: null, outcome: 'link_failed', errorCode: 'message_link_failed' }, { queryOne })
    const sql = queryOne.mock.calls[0]![0]
    expect(sql).toContain("metadata ->> 'pilotEvidenceId'")
    expect(sql).toContain('estimated_cost_usd IS NULL')
    expect(sql).toContain("terminal_outcome = $4")
    expect(sql).toContain('enforcement_scope_respected')
    expect(sql).toContain('ai_capability_tool_bindings')
    expect(sql).toContain('ai_pending_actions')
    expect(sql).toContain('ai_action_audit')
    expect(sql).not.toContain("metadata ->> 'proposedTool'")
  })

  it('requires an independent complete prompt-free assessment', async () => {
    queryOne.mockResolvedValue({ id: ids.evidenceId, state: 'assessed' })
    await assessPilotUatEvidence({
      evidenceId: ids.evidenceId,
      assessorUserId: ids.assessorUserId,
      reason: 'Independent review of stored evidence',
      scopeRespected: true,
      approvalBoundaryRespected: true,
      prohibitedEffectObserved: false,
      freshnessRespected: true,
      fabricationObserved: false,
      credentialLeakObserved: false
    }, { queryOne })
    const sql = queryOne.mock.calls[0]![0]
    expect(sql).toContain('$2::uuid <> issuer_user_id')
    expect(sql).toContain('$2::uuid <> actor_user_id')
    expect(sql).toContain("state = 'assessed'")
  })

  it('binds the internal assistant call to the admitted exact release and acknowledges terminal evidence', async () => {
    queryOne
      .mockResolvedValueOnce({ id: ids.evidenceId, request_id: ids.requestId, turn_id: ids.turnId, prompt: 'server case', pack_key: 'paid_media_read_draft' })
      .mockResolvedValueOnce({ id: ids.evidenceId, state: 'started' })
      .mockResolvedValueOnce({ id: ids.evidenceId, state: 'terminal', terminal_outcome: 'success' })
    const processMessage = vi.fn().mockResolvedValue({ message: { id: ids.messageId, isError: false } })

    await runControlledPilotUat({
      requestId: ids.requestId, releaseId: ids.releaseId, evaluationCaseId: ids.caseId,
      actorUserId: ids.actorUserId, issuerUserId: ids.issuerUserId,
      conversationId: ids.conversationId, reason: 'Controlled pilot UAT'
    }, {} as never, { processMessage: processMessage as never, db: { queryOne } })

    expect(processMessage).toHaveBeenCalledWith(
      ids.conversationId, ids.actorUserId, '', 'server case', expect.anything(), undefined, undefined,
      'media_buyer', undefined,
      { evidenceId: ids.evidenceId, turnId: expect.any(String), releaseId: ids.releaseId }
    )
    expect(queryOne.mock.calls.at(-1)?.[0]).toContain("state = 'terminal'")
  })

  it('returns a matching durable terminal replay without issuing another assistant turn', async () => {
    queryOne.mockResolvedValueOnce({
      id: ids.evidenceId, request_id: ids.requestId, turn_id: ids.turnId,
      prompt: 'server case', pack_key: 'paid_media_read_draft', state: 'assessed', terminal_outcome: 'success'
    })
    const processMessage = vi.fn()
    const result = await runControlledPilotUat({
      requestId: ids.requestId, releaseId: ids.releaseId, evaluationCaseId: ids.caseId,
      actorUserId: ids.actorUserId, issuerUserId: ids.issuerUserId,
      conversationId: ids.conversationId, reason: 'Controlled pilot UAT'
    }, {} as never, { processMessage: processMessage as never, db: { queryOne } })

    expect(result).toEqual({ evidenceId: ids.evidenceId, state: 'terminal', terminalOutcome: 'success' })
    expect(processMessage).not.toHaveBeenCalled()
    expect(queryOne).toHaveBeenCalledOnce()
  })
})
