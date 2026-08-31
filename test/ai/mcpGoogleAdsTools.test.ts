import { describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import {
  dispatchGoogleAdsConfirm,
  executeGoogleAdsTool,
  googleAdsReadTools,
  googleAdsWriteTools,
  isGoogleAdsToolName,
  projectGoogleAdsTools,
  type GoogleAdsMcpFlags
} from '~~/server/utils/ai/mcp/googleAdsTools'
import { isWriteScopeToolName } from '~~/server/utils/ai/mcp/scope'
import { executeWriteConfirm } from '~~/server/utils/ai/mcp/writeTools'

const PLAN_ID = '11111111-1111-4111-8111-111111111111'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333'
const ACTOR_ID = '44444444-4444-4444-8444-444444444444'

const off: GoogleAdsMcpFlags = {
  read: false,
  write: false,
  automation: false,
  destructive: false
}

function actionPlan(overrides: Partial<GoogleAdsActionPlan> = {}): GoogleAdsActionPlan {
  return {
    id: PLAN_ID,
    clientId: CLIENT_ID,
    connectionId: CONNECTION_ID,
    customerId: '1234567890',
    actorId: ACTOR_ID,
    source: 'mcp',
    toolName: 'google_ads.pause_campaign',
    resourceType: 'campaign',
    resourceName: 'customers/1234567890/campaigns/9',
    operation: 'pause_campaign',
    currentState: { status: 'ENABLED' },
    desiredState: { status: 'PAUSED' },
    currentStateFingerprint: 'a'.repeat(64),
    diff: [{ field: 'status', before: 'ENABLED', after: 'PAUSED' }],
    providerOperations: [{
      service: 'campaigns',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{
        update: { resourceName: 'customers/1234567890/campaigns/9', status: 'PAUSED' },
        updateMask: 'status'
      }]
    }],
    riskTier: 'confirm',
    executionMode: 'proposal',
    policyVersion: 'google-ads-v1',
    policyDecision: { allowed: true, riskTier: 'confirm', executionMode: 'proposal' },
    requestHash: 'b'.repeat(64),
    idempotencyKey: 'plan-9',
    status: 'pending_approval',
    expiresAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-08-31T00:00:00.000Z',
    ...overrides
  }
}

function dependencies(plan = actionPlan()) {
  return {
    loadPlan: vi.fn().mockResolvedValue(plan),
    getStatus: vi.fn().mockResolvedValue({ id: plan.id, status: plan.status }),
    validatePlan: vi.fn().mockResolvedValue({ valid: true, diffs: [] }),
    recordValidation: vi.fn().mockResolvedValue(undefined),
    listRecommendations: vi.fn().mockResolvedValue({ recommendations: [] }),
    proposePlan: vi.fn().mockResolvedValue({ proposalId: 'proposal-12345' }),
    executeAutomatic: vi.fn().mockResolvedValue({ ok: true, status: 'verified' })
  }
}

function schemaPropertyNames(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const own = record.properties && typeof record.properties === 'object'
    ? Object.keys(record.properties as Record<string, unknown>)
    : []
  return [
    ...own,
    ...Object.values(record).flatMap(schemaPropertyNames)
  ]
}

const context: ToolContext = {
  userId: ACTOR_ID,
  userRole: 'media_buyer',
  event: {} as never,
  source: 'mcp'
}

describe('Google Ads MCP tool projection', () => {
  it('projects no tools when all four flags are false', () => {
    expect(projectGoogleAdsTools('owner', off)).toEqual([])
  })

  it('lists recommendations through a typed read-only dependency', async () => {
    const listRecommendations = vi.fn().mockResolvedValue({
      customerId: '1234567890', optimizationScore: 0.82, recommendations: []
    })
    const result = await executeGoogleAdsTool('google_ads_list_recommendations', {
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      maxResults: 25,
      types: ['CAMPAIGN_BUDGET']
    }, context, { ...off, read: true }, { ...dependencies(), listRecommendations })
    expect(result).toMatchObject({ ok: true, data: { optimizationScore: 0.82 } })
    expect(listRecommendations).toHaveBeenCalledWith(expect.objectContaining({
      maxResults: 25,
      types: ['CAMPAIGN_BUDGET'],
      includeDismissed: false
    }), context)
  })

  it('projects read tools only for MEDIA_BUYING roles when read is enabled', () => {
    const names = projectGoogleAdsTools('media_buyer', { ...off, read: true }).map(tool => tool.name)
    expect(names).toEqual(googleAdsReadTools.map(tool => tool.name))
    expect(projectGoogleAdsTools('viewer', { ...off, read: true })).toEqual([])
  })

  it('projects proposal plus shared confirmation only when write is enabled', () => {
    const disabled = projectGoogleAdsTools('media_buyer', { ...off, read: true })
    const enabled = projectGoogleAdsTools('media_buyer', { ...off, write: true })
    expect(disabled.map(tool => tool.name)).not.toContain('propose_google_ads_action')
    expect(enabled.map(tool => tool.name)).toEqual([
      ...googleAdsWriteTools.map(tool => tool.name),
      'confirm_action'
    ])
  })

  it('classifies every Google write descriptor as requiring mcp:write', () => {
    for (const tool of googleAdsWriteTools) {
      expect(isWriteScopeToolName(tool.name), tool.name).toBe(true)
    }
  })

  it('lets a read-only scope filter remove every Google write descriptor', () => {
    const projected = projectGoogleAdsTools('owner', { ...off, read: true, write: true })
    const scoped = projected.filter(tool => !isWriteScopeToolName(tool.name))
    expect(scoped.map(tool => tool.name)).toEqual(googleAdsReadTools.map(tool => tool.name))
  })

  it('exposes no raw GAQL, mutate, URL, or query passthrough descriptor', () => {
    const tools = projectGoogleAdsTools('owner', {
      read: true,
      write: true,
      automation: true,
      destructive: true
    })
    expect(tools.map(tool => tool.name)).not.toContain('google_ads_gaql')
    expect(tools.map(tool => tool.name)).not.toContain('google_ads_mutate')
    const propertyNames = tools.flatMap(tool => schemaPropertyNames(tool.inputSchema))
    expect(propertyNames).not.toContain('url')
    expect(propertyNames).not.toContain('query')
    expect(isGoogleAdsToolName('google_ads_gaql')).toBe(false)
  })
})

describe('Google Ads MCP execution gates', () => {
  it('requires the read flag for status and validation tools', async () => {
    const deps = dependencies()

    await expect(executeGoogleAdsTool(
      'google_ads_get_action_status',
      { actionPlanId: PLAN_ID },
      context,
      off,
      deps
    )).resolves.toMatchObject({ ok: false, code: 'disabled' })
    expect(deps.loadPlan).not.toHaveBeenCalled()
  })

  it('requires write before persisting a proposal', async () => {
    const deps = dependencies()

    await expect(executeGoogleAdsTool(
      'propose_google_ads_action',
      { actionPlanId: PLAN_ID },
      context,
      { ...off, read: true },
      deps
    )).resolves.toMatchObject({ ok: false, code: 'disabled' })
    expect(deps.proposePlan).not.toHaveBeenCalled()
  })

  it('validates and audits the exact plan before persisting a proposal', async () => {
    const deps = dependencies()

    await expect(executeGoogleAdsTool(
      'propose_google_ads_action',
      { actionPlanId: PLAN_ID },
      context,
      { ...off, write: true },
      deps
    )).resolves.toMatchObject({ ok: true })

    expect(deps.validatePlan).toHaveBeenCalledWith(expect.objectContaining({ id: PLAN_ID }), context)
    expect(deps.recordValidation).toHaveBeenCalledWith(
      expect.objectContaining({ id: PLAN_ID }),
      expect.objectContaining({ valid: true }),
      context
    )
    expect(deps.validatePlan).toHaveBeenCalledBefore(deps.proposePlan)
    expect(deps.recordValidation).toHaveBeenCalledBefore(deps.proposePlan)
  })

  it('does not persist a proposal when provider preflight validation fails', async () => {
    const deps = dependencies()
    deps.validatePlan.mockResolvedValueOnce({
      valid: false,
      code: 'stale_plan',
      providerValidation: 'validate_only'
    })

    await expect(executeGoogleAdsTool(
      'propose_google_ads_action',
      { actionPlanId: PLAN_ID },
      context,
      { ...off, write: true },
      deps
    )).resolves.toMatchObject({ ok: false, code: 'validation_failed' })

    expect(deps.recordValidation).toHaveBeenCalled()
    expect(deps.proposePlan).not.toHaveBeenCalled()
  })

  it('requires automation as well as write for an automatic plan', async () => {
    const automatic = actionPlan({
      riskTier: 'automatic',
      executionMode: 'automatic',
      policyDecision: { allowed: true, riskTier: 'automatic', executionMode: 'automatic' },
      status: 'planned'
    })
    const deps = dependencies(automatic)

    await expect(executeGoogleAdsTool(
      'propose_google_ads_action',
      { actionPlanId: PLAN_ID },
      context,
      { ...off, write: true },
      deps
    )).resolves.toMatchObject({ ok: false, code: 'automation_disabled' })
    expect(deps.executeAutomatic).not.toHaveBeenCalled()

    await expect(executeGoogleAdsTool(
      'propose_google_ads_action',
      { actionPlanId: PLAN_ID },
      context,
      { ...off, write: true, automation: true },
      deps
    )).resolves.toMatchObject({ ok: true })
    expect(deps.executeAutomatic).toHaveBeenCalledWith(automatic, context)
  })

  it('requires destructive as well as write for provider removal', async () => {
    const destructive = actionPlan({
      operation: 'remove_campaign',
      riskTier: 'destructive_confirm',
      executionMode: 'proposal',
      policyDecision: {
        allowed: true,
        riskTier: 'destructive_confirm',
        executionMode: 'proposal'
      }
    })
    const deps = dependencies(destructive)

    await expect(executeGoogleAdsTool(
      'propose_google_ads_action',
      { actionPlanId: PLAN_ID },
      context,
      { ...off, write: true },
      deps
    )).resolves.toMatchObject({ ok: false, code: 'destructive_disabled' })
    expect(deps.proposePlan).not.toHaveBeenCalled()
  })
})

describe('Google Ads MCP confirmation dispatch', () => {
  it('uses the shared confirm path and restores a claim rejected before execution', async () => {
    const revertClaim = vi.fn().mockResolvedValue(undefined)
    const googleAdsDispatch = vi.fn().mockResolvedValue({
      ok: false,
      error: 'This Google Ads action requires explicit ack:true.',
      code: 'confirm_required'
    })

    await expect(executeWriteConfirm(
      { proposalId: '55555555-5555-4555-8555-555555555555' },
      context,
      {
        enabled: true,
        writeEnabled: false,
        claim: vi.fn().mockResolvedValue({
          tool_name: 'google_ads_action',
          resolved_payload: { actionPlanId: PLAN_ID }
        }),
        getExecutor: vi.fn().mockReturnValue(null),
        revertClaim,
        googleAdsDispatch
      }
    )).resolves.toMatchObject({ ok: false, code: 'confirm_required' })
    expect(googleAdsDispatch).toHaveBeenCalled()
    expect(revertClaim).toHaveBeenCalled()
  })

  it('ignores pending rows owned by another action family', async () => {
    const deps = dependencies()
    await expect(dispatchGoogleAdsConfirm(
      { tool_name: 'video_generation', resolved_payload: {} },
      'proposal-12345',
      true,
      context,
      { ...off, write: true },
      {
        loadPlan: deps.loadPlan,
        approvePlan: vi.fn(),
        executeConfirmed: vi.fn()
      }
    )).resolves.toBeNull()
  })

  it('requires explicit acknowledgement for rich and destructive confirmations', async () => {
    const destructive = actionPlan({
      operation: 'remove_campaign',
      riskTier: 'destructive_confirm',
      policyDecision: {
        allowed: true,
        riskTier: 'destructive_confirm',
        executionMode: 'proposal'
      }
    })
    const approvePlan = vi.fn()

    await expect(dispatchGoogleAdsConfirm(
      { tool_name: 'google_ads_action', resolved_payload: { actionPlanId: PLAN_ID } },
      'proposal-12345',
      false,
      context,
      { ...off, write: true, destructive: true },
      {
        loadPlan: vi.fn().mockResolvedValue(destructive),
        approvePlan,
        executeConfirmed: vi.fn()
      }
    )).resolves.toMatchObject({ ok: false, code: 'confirm_required' })
    expect(approvePlan).not.toHaveBeenCalled()
  })

  it('approves the bound plan before executing a confirmed proposal', async () => {
    const approved = actionPlan({ status: 'approved', approvalId: '55555555-5555-4555-8555-555555555555' })
    const approvePlan = vi.fn().mockResolvedValue(approved)
    const executeConfirmed = vi.fn().mockResolvedValue({ ok: true, status: 'verified' })

    await expect(dispatchGoogleAdsConfirm(
      { tool_name: 'google_ads_action', resolved_payload: { actionPlanId: PLAN_ID } },
      '55555555-5555-4555-8555-555555555555',
      true,
      context,
      { ...off, write: true },
      {
        loadPlan: vi.fn().mockResolvedValue(actionPlan()),
        approvePlan,
        executeConfirmed
      }
    )).resolves.toMatchObject({ ok: true })
    expect(approvePlan).toHaveBeenCalledBefore(executeConfirmed)
    expect(executeConfirmed).toHaveBeenCalledWith(approved, context)
  })
})
