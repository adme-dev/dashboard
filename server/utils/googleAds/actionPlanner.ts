import { createHash, randomUUID as createRandomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  GoogleAdsActionPlanSchema,
  GoogleAdsOperationTypeSchema,
  GoogleAdsPolicyDecisionSchema,
  GoogleAdsResourceTypeSchema,
  type GoogleAdsActionPlan,
  type GoogleAdsPolicyDecision,
  type GoogleAdsProviderMutation
} from '~~/server/utils/googleAds/contracts'

const PlanGoogleAdsActionInputSchema = z.strictObject({
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  actorId: z.string().uuid(),
  source: z.enum(['mcp', 'chat', 'ui', 'automation']),
  operation: GoogleAdsOperationTypeSchema,
  resourceType: GoogleAdsResourceTypeSchema,
  requestedMode: z.enum(['automatic', 'proposal']),
  arguments: z.unknown(),
  idempotencyKey: z.string().trim().min(1).max(255)
})

export type PlanGoogleAdsActionInput = z.infer<typeof PlanGoogleAdsActionInputSchema>

export interface GoogleAdsConnectionBinding {
  clientId: string | null
  connectionId: string
  customerId: string
  platform: 'google' | string
  status: 'active' | string
}

export interface BuildGoogleAdsActionContext {
  input: PlanGoogleAdsActionInput
  connection: GoogleAdsConnectionBinding
  customerId: string
  currentState: unknown
}

export interface BuiltGoogleAdsAction {
  resourceName?: string | null
  desiredState: unknown
  providerOperations: GoogleAdsProviderMutation[]
}

export interface ResolvePlannedGoogleAdsPolicyContext extends BuildGoogleAdsActionContext {
  builtAction: BuiltGoogleAdsAction
}

export interface GoogleAdsActionPlannerDependencies {
  resolveConnection(clientId: string, connectionId: string): Promise<GoogleAdsConnectionBinding | null>
  loadCurrent(context: Omit<BuildGoogleAdsActionContext, 'currentState'>): Promise<unknown>
  buildAction(context: BuildGoogleAdsActionContext): Promise<BuiltGoogleAdsAction>
  resolvePolicy(context: ResolvePlannedGoogleAdsPolicyContext): GoogleAdsPolicyDecision
  persist(plan: GoogleAdsActionPlan): Promise<GoogleAdsActionPlan>
  policyVersion?: string
  grantId?: string | null
  now?: () => Date
  randomUUID?: () => string
}

const MISSING_VALUE = Object.freeze({ absent: true })
const CUSTOMER_RESOURCE_PATTERN = /customers\/(\d{1,20})(?:\/|$)/g

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function canonicalizeGoogleAdsValue(value: unknown, active = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Google Ads action values must contain finite numbers')
    return Object.is(value, -0) ? 0 : value
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Google Ads action values contain an invalid date')
    return value.toISOString()
  }
  if (typeof value !== 'object' || value === undefined) {
    throw new Error('Google Ads action values must be JSON serializable')
  }
  if (active.has(value)) throw new Error('Google Ads action values must be acyclic JSON')
  active.add(value)

  try {
    if (Array.isArray(value)) {
      return value.map(item => canonicalizeGoogleAdsValue(item, active))
    }
    if (!isPlainObject(value)) {
      throw new Error('Google Ads action values must use plain JSON objects')
    }

    const canonical: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      canonical[key] = canonicalizeGoogleAdsValue(value[key], active)
    }
    return canonical
  } finally {
    active.delete(value)
  }
}

function canonicalString(value: unknown): string {
  return JSON.stringify(canonicalizeGoogleAdsValue(value))
}

export function hashGoogleAdsValue(value: unknown): string {
  return createHash('sha256').update(canonicalString(value)).digest('hex')
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return canonicalString(left) === canonicalString(right)
}

export function diffGoogleAdsStates(
  before: unknown,
  after: unknown,
  prefix = ''
): Array<{ field: string, before: unknown, after: unknown }> {
  if (valuesEqual(before, after)) return []

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    return keys.flatMap((key) => {
      const field = prefix ? `${prefix}.${key}` : key
      const beforeValue = Object.hasOwn(before, key) ? before[key] : MISSING_VALUE
      const afterValue = Object.hasOwn(after, key) ? after[key] : MISSING_VALUE
      return diffGoogleAdsStates(beforeValue, afterValue, field)
    })
  }

  return [{
    field: prefix || '$',
    before: canonicalizeGoogleAdsValue(before),
    after: canonicalizeGoogleAdsValue(after)
  }]
}

function cleanCustomerId(value: string): string {
  const cleaned = value.replace(/-/g, '')
  if (!/^\d{1,20}$/.test(cleaned)) throw new Error('Invalid Google Ads customer ID')
  return cleaned
}

function assertResourcesBelongToCustomer(value: unknown, customerId: string): void {
  const canonical = canonicalizeGoogleAdsValue(value)
  const serialized = JSON.stringify(canonical)
  for (const match of serialized.matchAll(CUSTOMER_RESOURCE_PATTERN)) {
    if (match[1] !== customerId) {
      throw new Error('A provider resource is outside the selected Google Ads customer')
    }
  }
}

function assertConnectionBinding(
  connection: GoogleAdsConnectionBinding | null,
  input: PlanGoogleAdsActionInput
): asserts connection is GoogleAdsConnectionBinding {
  if (!connection) throw new Error('Google Ads connection was not found')
  if (connection.connectionId !== input.connectionId) {
    throw new Error('Google Ads connection binding does not match the selected connection')
  }
  if (connection.clientId !== input.clientId) {
    throw new Error('Google Ads connection is not assigned to this client')
  }
  if (connection.platform !== 'google') throw new Error('Selected connection is not a Google Ads connection')
  if (connection.status !== 'active') throw new Error('Selected Google Ads connection is not active')
}

export async function planGoogleAdsAction(
  rawInput: PlanGoogleAdsActionInput,
  dependencies: GoogleAdsActionPlannerDependencies
): Promise<GoogleAdsActionPlan> {
  const input = PlanGoogleAdsActionInputSchema.parse(rawInput)
  const connection = await dependencies.resolveConnection(input.clientId, input.connectionId)
  assertConnectionBinding(connection, input)
  const customerId = cleanCustomerId(connection.customerId)

  assertResourcesBelongToCustomer(input.arguments, customerId)
  const currentContext = { input, connection, customerId }
  const currentState = canonicalizeGoogleAdsValue(await dependencies.loadCurrent(currentContext))
  const buildContext = { ...currentContext, currentState }
  const built = await dependencies.buildAction(buildContext)
  const builtAction: BuiltGoogleAdsAction = {
    resourceName: built.resourceName ?? null,
    desiredState: canonicalizeGoogleAdsValue(built.desiredState),
    providerOperations: built.providerOperations
  }
  assertResourcesBelongToCustomer(builtAction, customerId)

  const policyDecision = GoogleAdsPolicyDecisionSchema.parse(dependencies.resolvePolicy({
    ...buildContext,
    builtAction
  }))
  const now = (dependencies.now ?? (() => new Date()))()
  if (Number.isNaN(now.getTime())) throw new Error('Planner clock returned an invalid date')
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1_000)
  const currentStateFingerprint = hashGoogleAdsValue(currentState)
  const diff = diffGoogleAdsStates(currentState, builtAction.desiredState)

  const requestHash = hashGoogleAdsValue({
    clientId: input.clientId,
    connectionId: input.connectionId,
    customerId,
    actorId: input.actorId,
    operation: input.operation,
    resourceType: input.resourceType,
    arguments: input.arguments,
    currentStateFingerprint,
    desiredState: builtAction.desiredState,
    providerOperations: builtAction.providerOperations
  })

  const plan = GoogleAdsActionPlanSchema.parse({
    id: (dependencies.randomUUID ?? createRandomUUID)(),
    clientId: input.clientId,
    connectionId: input.connectionId,
    customerId,
    actorId: input.actorId,
    grantId: dependencies.grantId ?? null,
    source: input.source,
    toolName: `google_ads.${input.operation}`,
    resourceType: input.resourceType,
    resourceName: builtAction.resourceName ?? null,
    operation: input.operation,
    currentState,
    desiredState: builtAction.desiredState,
    currentStateFingerprint,
    diff,
    providerOperations: builtAction.providerOperations,
    riskTier: policyDecision.riskTier,
    executionMode: policyDecision.executionMode,
    policyVersion: dependencies.policyVersion ?? 'google-ads-v1',
    policyDecision,
    requestHash,
    idempotencyKey: input.idempotencyKey,
    status: !policyDecision.allowed
      ? 'cancelled'
      : policyDecision.executionMode === 'automatic' ? 'planned' : 'pending_approval',
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString()
  })

  return dependencies.persist(plan)
}
