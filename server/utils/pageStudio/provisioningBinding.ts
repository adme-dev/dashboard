import { z } from 'zod'

export interface PageStudioProvisioningScope {
  businessId: string
  clientId: string
  environment: 'preview' | 'staging' | 'production'
  siteId: string
  tenantId: string
}

export interface PageStudioProvisionerBinding {
  createProvisioning: (job: unknown) => Promise<unknown>
  readProvisioning?: (requestKey: string, scope: PageStudioProvisioningScope) => Promise<unknown>
}

export type PageStudioProvisioningEnvironment = 'staging' | 'production'

export function getPageStudioProvisioningRuntime(env: Record<string, unknown> | undefined): {
  environment: PageStudioProvisioningEnvironment
  binding: PageStudioProvisionerBinding
} | null {
  const environment = env?.PAGE_STUDIO_PROVISIONING_ENVIRONMENT
  const binding = env?.PAGE_STUDIO_PROVISIONER as PageStudioProvisionerBinding | undefined
  if ((environment !== 'staging' && environment !== 'production')
    || typeof binding?.createProvisioning !== 'function'
    || typeof binding?.readProvisioning !== 'function') return null
  return { environment, binding }
}

export function requirePageStudioProvisioningRuntime(env: Record<string, unknown> | undefined) {
  const runtime = getPageStudioProvisioningRuntime(env)
  if (!runtime) throw new PageStudioProvisioningError('PROVISIONER_UNAVAILABLE', 'Website provisioning is not configured for this environment')
  return runtime
}

export class PageStudioProvisioningError extends Error {
  constructor(readonly code: 'PROVISIONER_UNAVAILABLE' | 'PROVISIONER_FAILED' | 'INVALID_PROVISIONING_PLAN' | 'PROVISIONING_OWNER_REQUIRED' | 'PROVISIONING_AUTHORITY_DENIED' | 'PROVISIONING_NOT_FOUND' | 'INVALID_PROVISIONING_REQUEST', message: string, readonly statusCode = 503) {
    super(message)
    this.name = 'PageStudioProvisioningError'
  }
}

const SavedPlan = z.object({
  starterVersion: z.enum(['limousine-v1', 'floristry-v1', 'retail-v1', 'it-goods-v1', 'import-export-v1']),
  modules: z.array(z.enum(['business-content', 'bookings', 'catalogue', 'delivery', 'email', 'enquiries', 'inventory', 'orders'])).max(12),
  pages: z.array(z.string().min(1).max(100)).min(1).max(32),
  collections: z.array(z.string().min(1).max(100)).min(1).max(32)
})

const SetupSnapshot = z.object({
  businessName: z.string().trim().min(2).max(120),
  proposalRevision: z.number().int().min(1),
  source: z.enum(['template', 'chat']),
  brief: z.string().trim().max(4000).optional()
}).strict().superRefine((setup, context) => {
  if (setup.source === 'chat' && !setup.brief) context.addIssue({ code: 'custom', path: ['brief'], message: 'Chat setup requires the accepted brief' })
})

const Actor = z.object({ kind: z.enum(['client-user', 'agency-user']), userId: z.string().uuid() }).strict()
const ContentId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/)
const Scope = z.object({
  businessId: ContentId, clientId: ContentId, tenantId: ContentId,
  siteId: z.union([z.string().min(3).max(64).regex(/^[a-z][a-z0-9_-]*$/), z.string().uuid()]),
  environment: z.enum(['preview', 'staging', 'production'])
}).strict()
const JobKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)
// Keep this service boundary aligned with Foundation's ProvisioningJobSchema.
const JobSnapshot = z.object({
  actor: Actor.optional(), id: JobKey, requestKey: JobKey,
  generationVersion: z.literal(2).optional(),
  attempts: z.number().int().min(0).max(20), error: z.string().max(1000).nullable(),
  phase: z.enum(['requested', 'validated', 'resources-created', 'site-seeded', 'content-seeded', 'complete', 'failed']),
  plan: z.object({
    templateId: SavedPlan.shape.starterVersion, enabledModules: SavedPlan.shape.modules,
    pages: SavedPlan.shape.pages, collections: SavedPlan.shape.collections, scope: Scope
  }).strict(),
  resources: z.object({ contentBinding: z.string().nullable(), database: z.string().nullable(), site: z.string().nullable() }).strict(),
  scope: Scope, setup: SetupSnapshot.optional(), templateId: SavedPlan.shape.starterVersion,
  updatedAt: z.string().min(1).max(64)
}).strict()

export { JobSnapshot as PageStudioProvisioningJobSchema, Scope as PageStudioProvisioningScopeSchema, SetupSnapshot as PageStudioProvisioningSetupSchema }

function matchingJob(result: unknown, expected: z.infer<typeof JobSnapshot>) {
  const parsed = JobSnapshot.safeParse(result)
  if (!parsed.success || parsed.data.id !== expected.id || parsed.data.requestKey !== expected.requestKey
    || parsed.data.generationVersion !== expected.generationVersion
    || parsed.data.templateId !== expected.templateId
    || JSON.stringify(parsed.data.scope) !== JSON.stringify(expected.scope)
    || JSON.stringify(parsed.data.plan) !== JSON.stringify(expected.plan)
    || JSON.stringify(parsed.data.setup) !== JSON.stringify(expected.setup)) {
    throw new PageStudioProvisioningError('PROVISIONER_FAILED', 'Provisioning service returned a mismatched job, scope or setup context')
  }
  if (!parsed.data.actor) throw new PageStudioProvisioningError('PROVISIONING_OWNER_REQUIRED', 'This setup has no initiating owner and requires reconciliation', 409)
  if (parsed.data.actor.kind !== expected.actor?.kind) {
    throw new PageStudioProvisioningError('PROVISIONER_FAILED', 'Provisioning request belongs to a different actor kind')
  }
  return { ...parsed.data, actor: parsed.data.actor }
}

/** Translate the retained, reviewed Dashboard proposal into the Worker contract.
 * Scope always comes from the authenticated site lookup, not proposal metadata.
 */
export function normalizePageStudioProvisioningPlan(input: unknown, scope: PageStudioProvisioningScope) {
  const parsed = SavedPlan.safeParse(input)
  if (!parsed.success) {
    throw new PageStudioProvisioningError('INVALID_PROVISIONING_PLAN', 'The accepted setup plan has an unsupported template or invalid modules, pages or collections', 422)
  }
  return {
    templateId: parsed.data.starterVersion,
    enabledModules: parsed.data.modules,
    pages: parsed.data.pages,
    collections: parsed.data.collections,
    scope
  }
}

export interface PageStudioProvisioningDispatchInput {
  initiatingUserId: string
  initiatingActorKind?: 'client-user' | 'agency-user'
  requestKey: string
  scope: PageStudioProvisioningScope
  now: string
  plan: Record<string, unknown>
  revision: number
  source: 'template' | 'chat'
  brief?: string | null
}

export function createPageStudioProvisioningJob(input: PageStudioProvisioningDispatchInput) {
  const plan = normalizePageStudioProvisioningPlan(input.plan, input.scope)
  const parsedSetup = SetupSnapshot.safeParse({ businessName: input.plan.businessName, proposalRevision: input.revision, source: input.source, ...(input.brief == null ? {} : { brief: input.brief }) })
  if (!parsedSetup.success) throw new PageStudioProvisioningError('INVALID_PROVISIONING_PLAN', 'The accepted setup proposal is missing a valid business name, revision or brief', 422)
  const id = input.requestKey.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 128)
  const candidate = JobSnapshot.safeParse({
    actor: { kind: input.initiatingActorKind ?? 'client-user', userId: input.initiatingUserId },
    id,
    requestKey: input.requestKey,
    phase: 'requested',
    attempts: 0,
    error: null,
    plan,
    resources: { contentBinding: null, database: null, site: null },
    scope: input.scope,
    setup: parsedSetup.data,
    templateId: plan.templateId,
    updatedAt: input.now
  })
  if (!candidate.success) throw new PageStudioProvisioningError('INVALID_PROVISIONING_PLAN', 'Invalid initiating identity or provisioning context', 422)
  return candidate.data
}

export async function dispatchPageStudioProvisioning(
  binding: PageStudioProvisionerBinding | undefined,
  input: PageStudioProvisioningDispatchInput
) {
  if (!binding) throw new PageStudioProvisioningError('PROVISIONER_UNAVAILABLE', 'Page Studio provisioning service is not configured')
  const candidate = createPageStudioProvisioningJob(input)
  if (!binding.readProvisioning) throw new PageStudioProvisioningError('PROVISIONER_UNAVAILABLE', 'Page Studio provisioning service cannot reconcile existing requests')
  try {
    const existing = await binding.readProvisioning(input.requestKey, input.scope)
    if (existing !== null) return matchingJob(existing, candidate)
    let result: unknown
    try {
      result = await binding.createProvisioning(candidate)
    } catch (error) {
      // A competing first request or lost acknowledgement may already be durable.
      const retained = await binding.readProvisioning(input.requestKey, input.scope)
      if (retained !== null) return matchingJob(retained, candidate)
      throw error
    }
    const saved = matchingJob(result, candidate)
    if (saved.actor.userId !== input.initiatingUserId) throw new Error('Provisioning service returned a mismatched initiating actor')
    return saved
  } catch (error) {
    if (error instanceof PageStudioProvisioningError) throw error
    throw new PageStudioProvisioningError('PROVISIONER_FAILED', 'Provisioning request failed')
  }
}

export async function readPageStudioProvisioning(
  binding: PageStudioProvisionerBinding | undefined,
  input: { requestKey: string, scope: PageStudioProvisioningScope }
) {
  if (!binding?.readProvisioning) return null
  try {
    const result = await binding.readProvisioning(input.requestKey, input.scope) as { requestKey?: unknown, scope?: Record<string, unknown> } | null
    if (result === null) return null
    const scope = result?.scope
    if (result?.requestKey !== input.requestKey
      || !scope
      || scope.businessId !== input.scope.businessId
      || scope.clientId !== input.scope.clientId
      || scope.environment !== input.scope.environment
      || scope.siteId !== input.scope.siteId
      || scope.tenantId !== input.scope.tenantId) {
      throw new Error('Provisioning service returned a mismatched scope')
    }
    return result
  } catch {
    throw new PageStudioProvisioningError('PROVISIONER_FAILED', 'Provisioning status request failed')
  }
}
