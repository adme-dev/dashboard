import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import type { GoogleAdsMutateResult } from '~~/server/utils/googleAds/mutate'
import { resolveGoogleAdsControlSession } from '~~/server/utils/googleAds/controlSession'
import {
  appendGoogleAdsActionEvent,
  reconcileGoogleAdsActionPlanVerification
} from '~~/server/utils/googleAds/actionStore'
import {
  loadSearchGoogleAdsPlanState,
  verifySearchGoogleAdsState
} from '~~/server/utils/googleAds/searchState'
import { isSearchGoogleAdsOperation } from '~~/server/utils/googleAds/searchOperations'

export interface GoogleAdsReverificationDependencies {
  resolveSession: typeof resolveGoogleAdsControlSession
  loadState: typeof loadSearchGoogleAdsPlanState
  event(input: Parameters<typeof appendGoogleAdsActionEvent>[0]): Promise<unknown>
  reconcile(input: Parameters<typeof reconcileGoogleAdsActionPlanVerification>[0]): ReturnType<typeof reconcileGoogleAdsActionPlanVerification>
}

const defaultDependencies: GoogleAdsReverificationDependencies = {
  resolveSession: resolveGoogleAdsControlSession,
  loadState: loadSearchGoogleAdsPlanState,
  event: appendGoogleAdsActionEvent,
  reconcile: reconcileGoogleAdsActionPlanVerification
}

const REMOVAL_OPERATIONS = new Set([
  'remove_campaign',
  'remove_ad_group',
  'remove_ad',
  'remove_keyword',
  'remove_negative_keyword'
])
const UNSUPPORTED_REVERIFICATION_OPERATIONS = new Set([
  'replace_ad'
])

function removalEvidence(plan: GoogleAdsActionPlan): GoogleAdsMutateResult | undefined {
  if (!plan.resourceName || !REMOVAL_OPERATIONS.has(plan.operation)) return undefined
  return { results: [{ resourceName: plan.resourceName }] }
}

function unsupportedReason(plan: GoogleAdsActionPlan): string | null {
  if (!isSearchGoogleAdsOperation(plan.operation)) return 'operation_not_supported'
  if (!plan.resourceName) return 'provider_resource_not_persisted'
  if (UNSUPPORTED_REVERIFICATION_OPERATIONS.has(plan.operation)) {
    return 'replacement_resource_not_persisted'
  }
  return null
}

async function assertBoundSession(
  plan: GoogleAdsActionPlan,
  dependencies: GoogleAdsReverificationDependencies
) {
  const session = await dependencies.resolveSession({
    clientId: plan.clientId,
    connectionId: plan.connectionId
  })
  if (session.connection.clientId !== plan.clientId
    || session.connection.connectionId !== plan.connectionId
    || session.connection.customerId !== plan.customerId) {
    throw new Error('Google Ads action plan no longer matches its tenant connection')
  }
  return session
}

export interface GoogleAdsDriftInspection {
  actionPlanId: string
  supported: boolean
  matchesDesiredState: boolean
  status: GoogleAdsActionPlan['status']
  resourceName: string | null
  reason?: string
  diffs: Array<{ field: string, expected: unknown, actual: unknown }>
}

export async function inspectGoogleAdsActionPlanDrift(
  plan: GoogleAdsActionPlan,
  actorId: string,
  overrides: Partial<GoogleAdsReverificationDependencies> = {}
): Promise<GoogleAdsDriftInspection> {
  if (plan.actorId !== actorId) throw new Error('Google Ads action plan belongs to another actor')
  const dependencies = { ...defaultDependencies, ...overrides }
  const reason = unsupportedReason(plan)
  if (reason) {
    return {
      actionPlanId: plan.id,
      supported: false,
      matchesDesiredState: false,
      status: plan.status,
      resourceName: plan.resourceName,
      reason,
      diffs: []
    }
  }
  const session = await assertBoundSession(plan, dependencies)
  const actualState = await dependencies.loadState(
    plan,
    session.auth,
    {},
    removalEvidence(plan)
  )
  const verification = verifySearchGoogleAdsState(plan.desiredState, actualState)
  await dependencies.event({
    planId: plan.id,
    clientId: plan.clientId,
    actorId,
    eventType: 'drift_inspected',
    metadata: {
      matchesDesiredState: verification.ok,
      diffFields: verification.diffs.map(diff => diff.field).slice(0, 1_000)
    }
  })
  return {
    actionPlanId: plan.id,
    supported: true,
    matchesDesiredState: verification.ok,
    status: plan.status,
    resourceName: plan.resourceName,
    diffs: verification.diffs
  }
}

export async function reverifyGoogleAdsActionPlan(
  plan: GoogleAdsActionPlan,
  actorId: string,
  overrides: Partial<GoogleAdsReverificationDependencies> = {}
): Promise<GoogleAdsDriftInspection & { reconciled: boolean }> {
  if (!['verification_failed', 'recovery_required', 'partially_verified'].includes(plan.status)) {
    throw new Error('Google Ads action plan is not eligible for manual reverification')
  }
  const dependencies = { ...defaultDependencies, ...overrides }
  const drift = await inspectGoogleAdsActionPlanDrift(plan, actorId, dependencies)
  if (!drift.supported || !drift.matchesDesiredState) {
    if (drift.supported) {
      await dependencies.event({
        planId: plan.id,
        clientId: plan.clientId,
        actorId,
        eventType: 'reverification_failed',
        metadata: { diffFields: drift.diffs.map(diff => diff.field).slice(0, 1_000) }
      })
    }
    return { ...drift, reconciled: false }
  }
  const reconciled = await dependencies.reconcile({
    id: plan.id,
    clientId: plan.clientId,
    actorId,
    verificationSummary: { ok: true, diffs: [] }
  })
  if (!reconciled) throw new Error('Google Ads action plan changed during reverification')
  await dependencies.event({
    planId: plan.id,
    clientId: plan.clientId,
    actorId,
    eventType: 'reverification_succeeded',
    metadata: { previousStatus: plan.status }
  })
  return { ...drift, status: reconciled.status, reconciled: true }
}
