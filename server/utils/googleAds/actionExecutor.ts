import { z } from 'zod'
import {
  GoogleAdsActionPlanSchema,
  GoogleAdsPolicyDecisionSchema,
  GoogleAdsVerificationDiffSchema,
  type GoogleAdsActionPlan,
  type GoogleAdsPolicyDecision,
  type GoogleAdsVerificationDiff
} from '~~/server/utils/googleAds/contracts'
import type { GoogleAdsMutateResult } from '~~/server/utils/googleAds/mutate'
import { normalizeGoogleAdsError } from '~~/server/utils/googleAds/errors'
import { hashGoogleAdsValue } from '~~/server/utils/googleAds/actionPlanner'

const ExecuteContextSchema = z.strictObject({
  clientId: z.string().uuid(),
  actorId: z.string().uuid()
})
const PlanIdSchema = z.string().uuid()
const VerificationResultSchema = z.strictObject({
  ok: z.boolean(),
  diffs: z.array(GoogleAdsVerificationDiffSchema).max(10_000)
})

export interface ExecuteGoogleAdsActionContext {
  clientId: string
  actorId: string
}

export interface CompleteGoogleAdsExecutionInput {
  id: string
  clientId: string
  status: 'verified' | 'partially_verified' | 'provider_rejected' | 'verification_failed' | 'recovery_required'
  providerRequestId?: string | null
  verificationSummary?: unknown
  resultMetadata?: unknown
}

export interface GoogleAdsExecutionEventInput {
  planId: string
  clientId: string
  actorId: string
  eventType: string
  metadata?: Record<string, unknown>
}

export interface GoogleAdsActionExecutorDependencies {
  loadPlan(id: string, clientId: string): Promise<GoogleAdsActionPlan | null>
  loadCurrent(plan: GoogleAdsActionPlan): Promise<unknown>
  resolvePolicy(
    plan: GoogleAdsActionPlan,
    context: ExecuteGoogleAdsActionContext
  ): GoogleAdsPolicyDecision & { policyVersion?: string }
  claim(plan: GoogleAdsActionPlan, expectedStatus: 'planned' | 'approved'): Promise<boolean>
  validate(plan: GoogleAdsActionPlan): Promise<GoogleAdsMutateResult>
  mutate(plan: GoogleAdsActionPlan): Promise<GoogleAdsMutateResult>
  verify(plan: GoogleAdsActionPlan): Promise<{ ok: boolean, diffs: GoogleAdsVerificationDiff[] }>
  event(input: GoogleAdsExecutionEventInput): Promise<void>
  complete(input: CompleteGoogleAdsExecutionInput): Promise<void>
}

export type GoogleAdsExecutionStatus
  = | 'not_found'
    | 'forbidden'
    | 'blocked'
    | 'policy_changed'
    | 'confirmation_required'
    | 'stale_plan'
    | 'already_handled'
    | 'provider_rejected'
    | 'verified'
    | 'partially_verified'
    | 'verification_failed'
    | 'recovery_required'
    | 'internal_error'

export interface GoogleAdsExecutionOutcome {
  ok: boolean
  status: GoogleAdsExecutionStatus
  code?: string
  message?: string
  providerRequestId?: string
  diffs?: GoogleAdsVerificationDiff[]
}

function safeErrorEvidence(error: unknown): {
  code: string
  category: string
  retryable: boolean
  requestId?: string
  message: string
} {
  const normalized = normalizeGoogleAdsError(error)
  return {
    code: normalized.code,
    category: normalized.category,
    retryable: normalized.retryable,
    requestId: normalized.requestId,
    message: normalized.safeMessage
  }
}

function isAmbiguousWriteFailure(error: unknown): boolean {
  const normalized = normalizeGoogleAdsError(error)
  if (normalized.retryable) return true
  if (['DEADLINE_EXCEEDED', 'UNAVAILABLE', 'INTERNAL_ERROR', 'BAD_GATEWAY'].includes(normalized.code)) {
    return true
  }
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const name = typeof record.name === 'string' ? record.name.toLowerCase() : ''
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : ''
  return name.includes('timeout')
    || name === 'aborterror'
    || message.includes('timed out')
    || message.includes('timeout')
    || message.includes('fetch failed')
    || message.includes('socket hang up')
}

async function recordEvent(
  dependencies: GoogleAdsActionExecutorDependencies,
  plan: GoogleAdsActionPlan,
  eventType: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await dependencies.event({
    planId: plan.id,
    clientId: plan.clientId,
    actorId: plan.actorId,
    eventType,
    metadata
  })
}

async function recordCompletion(
  dependencies: GoogleAdsActionExecutorDependencies,
  plan: GoogleAdsActionPlan,
  input: Omit<CompleteGoogleAdsExecutionInput, 'id' | 'clientId'>
): Promise<boolean> {
  try {
    await dependencies.complete({ id: plan.id, clientId: plan.clientId, ...input })
    await recordEvent(dependencies, plan, input.status, {
      providerRequestId: input.providerRequestId ?? null,
      verificationSummary: input.verificationSummary ?? null,
      resultMetadata: input.resultMetadata ?? null
    })
    return true
  } catch {
    return false
  }
}

function policyChanged(
  plan: GoogleAdsActionPlan,
  current: GoogleAdsPolicyDecision & { policyVersion?: string }
): boolean {
  return current.riskTier !== plan.riskTier
    || current.executionMode !== plan.executionMode
    || (current.policyVersion !== undefined && current.policyVersion !== plan.policyVersion)
}

export async function executeGoogleAdsAction(
  rawPlanId: string,
  rawContext: ExecuteGoogleAdsActionContext,
  dependencies: GoogleAdsActionExecutorDependencies
): Promise<GoogleAdsExecutionOutcome> {
  let plan: GoogleAdsActionPlan | null = null
  let claimed = false

  try {
    const planId = PlanIdSchema.parse(rawPlanId)
    const context = ExecuteContextSchema.parse(rawContext)
    const loadedPlan = await dependencies.loadPlan(planId, context.clientId)
    if (!loadedPlan) return { ok: false, status: 'not_found', message: 'Google Ads action was not found.' }
    plan = GoogleAdsActionPlanSchema.parse(loadedPlan)
    if (plan.clientId !== context.clientId || plan.actorId !== context.actorId) {
      return { ok: false, status: 'forbidden', message: 'Google Ads action does not belong to this user and client.' }
    }

    const expectedStatus = plan.executionMode === 'automatic' ? 'planned' : 'approved'
    if (plan.executionMode === 'proposal' && plan.status === 'pending_approval') {
      return { ok: false, status: 'confirmation_required', message: 'This Google Ads change still requires approval.' }
    }
    if (plan.status !== expectedStatus) {
      return { ok: false, status: 'already_handled', message: 'This Google Ads action is no longer claimable.' }
    }

    const resolvedPolicy = dependencies.resolvePolicy(plan, context)
    const { policyVersion, ...decisionFields } = resolvedPolicy
    const currentPolicy = GoogleAdsPolicyDecisionSchema.parse(decisionFields)
    if (!currentPolicy.allowed) {
      await recordEvent(dependencies, plan, 'policy_blocked', { code: currentPolicy.code ?? 'blocked' })
      return { ok: false, status: 'blocked', code: currentPolicy.code ?? 'blocked' }
    }
    const policyWithVersion = { ...currentPolicy, policyVersion }
    if (policyChanged(plan, policyWithVersion)) {
      await recordEvent(dependencies, plan, 'policy_changed')
      return { ok: false, status: 'policy_changed', message: 'Policy changed after this action was planned.' }
    }

    const currentState = await dependencies.loadCurrent(plan)
    if (hashGoogleAdsValue(currentState) !== plan.currentStateFingerprint) {
      await recordEvent(dependencies, plan, 'stale_plan')
      return { ok: false, status: 'stale_plan', message: 'Google Ads changed after this action was planned.' }
    }

    claimed = await dependencies.claim(plan, expectedStatus)
    if (!claimed) {
      return { ok: false, status: 'already_handled', message: 'This Google Ads action was already claimed or expired.' }
    }
    await recordEvent(dependencies, plan, 'claimed')

    let validation: GoogleAdsMutateResult
    try {
      validation = await dependencies.validate(plan)
    } catch (error) {
      const evidence = safeErrorEvidence(error)
      await recordCompletion(dependencies, plan, {
        status: 'provider_rejected',
        providerRequestId: evidence.requestId ?? null,
        resultMetadata: { phase: 'validate_only', error: evidence }
      })
      return {
        ok: false,
        status: 'provider_rejected',
        providerRequestId: evidence.requestId,
        code: evidence.code,
        message: evidence.message
      }
    }

    if (validation.partialFailureError !== undefined) {
      await recordCompletion(dependencies, plan, {
        status: 'provider_rejected',
        providerRequestId: validation.requestId ?? null,
        resultMetadata: { phase: 'validate_only', partialFailure: true }
      })
      return {
        ok: false,
        status: 'provider_rejected',
        providerRequestId: validation.requestId,
        message: 'Google Ads validate-only checks rejected part of this action.'
      }
    }

    let mutation: GoogleAdsMutateResult
    try {
      mutation = await dependencies.mutate(plan)
    } catch (error) {
      const evidence = safeErrorEvidence(error)
      const status = isAmbiguousWriteFailure(error) ? 'recovery_required' : 'provider_rejected'
      await recordCompletion(dependencies, plan, {
        status,
        providerRequestId: evidence.requestId ?? null,
        resultMetadata: { phase: 'live_mutation', error: evidence, writeRetried: false }
      })
      return {
        ok: false,
        status,
        providerRequestId: evidence.requestId,
        code: evidence.code,
        message: status === 'recovery_required'
          ? 'The Google Ads write outcome is uncertain and must be checked before retrying.'
          : evidence.message
      }
    }

    let verification: { ok: boolean, diffs: GoogleAdsVerificationDiff[] }
    try {
      verification = VerificationResultSchema.parse(await dependencies.verify(plan))
    } catch {
      await recordCompletion(dependencies, plan, {
        status: 'recovery_required',
        providerRequestId: mutation.requestId ?? null,
        resultMetadata: { phase: 'read_back', mutationReturned: true }
      })
      return {
        ok: false,
        status: 'recovery_required',
        providerRequestId: mutation.requestId,
        message: 'The Google Ads change was submitted but read-back verification failed.'
      }
    }

    const hasPartialFailure = mutation.partialFailureError !== undefined
    const status = verification.ok
      ? hasPartialFailure ? 'partially_verified' : 'verified'
      : 'verification_failed'
    const persisted = await recordCompletion(dependencies, plan, {
      status,
      providerRequestId: mutation.requestId ?? null,
      verificationSummary: verification,
      resultMetadata: {
        phase: 'read_back',
        mutationResultCount: mutation.results.length,
        partialFailure: hasPartialFailure
      }
    })
    if (!persisted) {
      return {
        ok: false,
        status: 'recovery_required',
        providerRequestId: mutation.requestId,
        message: 'The provider result could not be recorded and requires reconciliation.'
      }
    }

    return {
      ok: status === 'verified',
      status,
      providerRequestId: mutation.requestId,
      diffs: verification.diffs
    }
  } catch {
    if (plan && claimed) {
      await recordCompletion(dependencies, plan, {
        status: 'recovery_required',
        resultMetadata: { phase: 'orchestration', safeError: 'internal_error' }
      })
      return {
        ok: false,
        status: 'recovery_required',
        message: 'The claimed Google Ads action requires reconciliation.'
      }
    }
    return { ok: false, status: 'internal_error', message: 'Google Ads action execution could not start.' }
  }
}
