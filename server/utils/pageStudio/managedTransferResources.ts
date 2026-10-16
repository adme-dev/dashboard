import { createError } from 'h3'
import { z } from 'zod'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ContentAttachmentRequestSchema, contentAttachmentIdentity, requireMatchingContentAttachmentRequest, type ContentAttachmentRequest } from '~~/shared/pageStudio/content-attachment'
import { ManagedTransferReferenceSchema, withReservedManagedTransfer } from './managedTransferIntent'
import { ManagedTransferPhysicalResourcesSchema, ManagedTransferProviderSchema } from './managedTransferResourceProof'
import type { PageStudioQueryClient, RunPageStudioTransaction } from './sites'

const Artifacts = ContentAttachmentRequestSchema.pick({ runtimeDigest: true, schemaDigest: true }).extend({
  policyVersion: z.literal('content-attachment-v1')
}).strict()
const Execution = ManagedTransferReferenceSchema.extend({ resourceRequest: ContentAttachmentRequestSchema }).strict()
const denied = () => createError({ statusCode: 403, statusMessage: 'Managed transfer resource access denied' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Managed transfer resource preparation changed. Resume the original operation.' })
interface Row { intent_digest: string, request: unknown, request_digest: string, identity: string }
type Dependencies = { runTransaction?: RunPageStudioTransaction }

async function check(row: Row, intentDigest: string, request?: ContentAttachmentRequest) {
  const parsed = ContentAttachmentRequestSchema.safeParse(row.request)
  if (!parsed.success || row.intent_digest !== intentDigest
    || row.request_digest !== await collectionDigest(parsed.data)
    || row.identity !== await contentAttachmentIdentity(parsed.data)) throw denied()
  if (request) {
    try {
      requireMatchingContentAttachmentRequest(parsed.data, request)
    } catch { throw denied() }
  }
  return parsed.data
}

/** Server-only preparation for the resource-only attachment executor. Its
 * original checkpoint is an immutable read anchor, never a new site seed.
 * Artifacts are reviewed deployment configuration, not browser/body fields.
 * Returns redacted progress. Does not invoke setup, activate a route or switch
 * native CMS selection. Ordinary attachment admission remains unchanged.
 */
export async function prepareManagedTransferResources(input: unknown,
  dependencies: Dependencies & { artifacts: unknown }
) {
  const parsed = ManagedTransferReferenceSchema.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid managed transfer reference' })
  const artifacts = Artifacts.safeParse(dependencies.artifacts)
  if (!artifacts.success) throw createError({ statusCode: 503, statusMessage: 'Reviewed transfer resource configuration is unavailable' })
  const reference = parsed.data
  return withReservedManagedTransfer(reference, async (db, intent) => {
    // This actor is the original real platform operator. Native owner/plan
    // authority is retained separately and rechecked by every transfer guard.
    const original = (await db.query<{ request: { authority: { operator: { actorId: string, loginSessionHash: string } } } }>(
      'SELECT request FROM page_studio_managed_transfer_intents WHERE operation_id=$1', [reference.operationId])).rows[0]!
    const operator = original.request.authority.operator
    const request = ContentAttachmentRequestSchema.parse({
      version: 1, mode: 'attach-existing-content', operationId: intent.destination.requestKey,
      scope: intent.authority.destination, actor: { kind: 'agency-user', userId: operator.actorId, loginSessionHash: operator.loginSessionHash },
      anchor: { checkpointId: intent.source.checkpoint.id, digest: intent.source.checkpoint.digest }, ...artifacts.data
    })
    const identity = await contentAttachmentIdentity(request)
    const digest = await collectionDigest(request)
    const existing = (await db.query<Row>('SELECT intent_digest,request,request_digest,identity FROM page_studio_managed_transfer_resources WHERE operation_id=$1', [reference.operationId])).rows[0]
    if (existing) {
      try {
        await check(existing, reference.intentDigest, request)
      } catch { throw conflict() }
    } else {
      await db.query(`INSERT INTO page_studio_managed_transfer_resources(operation_id,intent_digest,request,request_digest,identity)
        VALUES($1,$2,$3::jsonb,$4,$5)`, [reference.operationId, reference.intentDigest, JSON.stringify(request), digest, identity])
    }
    return { ...reference, state: 'resources-reserved' as const, resourceIdentity: identity, resourceRequestDigest: digest }
  }, dependencies)
}

/** Private executor admission only; never expose this return value in browser
 * status responses. Recheck before AND after each remote resource operation.
 * A successful check is not a resource receipt or permanent capability.
 */
export async function authorizeManagedTransferResources(input: unknown, dependencies: Dependencies = {}) {
  const parsed = Execution.safeParse(input)
  if (!parsed.success) throw denied()
  const { resourceRequest, ...reference } = parsed.data
  if (resourceRequest.scope.environment !== 'production') throw denied()
  return withReservedManagedTransfer(reference, async (db) => {
    const row = (await db.query<Row>('SELECT intent_digest,request,request_digest,identity FROM page_studio_managed_transfer_resources WHERE operation_id=$1', [reference.operationId])).rows[0]
    if (!row) throw denied()
    return check(row, reference.intentDigest, resourceRequest)
  }, dependencies)
}

/** Private two-phase binding. Resolve the original request under native authority,
 * leave SQL locks before provider inspection, then recheck that same authority
 * and every source head before retaining immutable evidence. No route, editor,
 * release pointer or customer-visible state is selected here.
 */
export async function bindManagedTransferResources(input: unknown, dependencies: Dependencies & {
  provider: unknown
  inspect: (request: z.infer<typeof Execution>) => Promise<unknown>
}) {
  const options = { ...dependencies }
  const parsed = ManagedTransferReferenceSchema.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid managed transfer reference' })
  const provider = ManagedTransferProviderSchema.safeParse(options.provider)
  if (!provider.success) throw createError({ statusCode: 503, statusMessage: 'Reviewed transfer provider configuration is unavailable' })
  const reference = parsed.data
  const resolve = async (db: PageStudioQueryClient) => {
    const row = (await db.query<Row>('SELECT intent_digest,request,request_digest,identity FROM page_studio_managed_transfer_resources WHERE operation_id=$1', [reference.operationId])).rows[0]
    if (!row) throw denied()
    return { row, request: await check(row, reference.intentDigest) }
  }
  const original = await withReservedManagedTransfer(reference, resolve, options)
  // Parse immediately to detach the provider's object before any further await.
  const observed = ManagedTransferPhysicalResourcesSchema.safeParse(await options.inspect({ ...reference, resourceRequest: structuredClone(original.request) }))
  if (!observed.success) throw conflict()
  const physical = observed.data
  return withReservedManagedTransfer(reference, async (db, intent) => {
    const current = await resolve(db)
    await check(current.row, reference.intentDigest, original.request)
    const { database, worker } = physical
    if (physical.operationId !== reference.operationId || physical.intentDigest !== reference.intentDigest
      || physical.resourceIdentity !== current.row.identity
      || database.accountId !== provider.data.accountId || worker.accountId !== provider.data.accountId
      || database.databaseId !== worker.databaseId
      || database.schemaDigest !== current.request.schemaDigest || worker.runtimeDigest !== current.request.runtimeDigest
      || worker.compatibilityDate !== provider.data.compatibilityDate
      || collectionCanonical(worker.scope) !== collectionCanonical(intent.authority.destination)
      || collectionCanonical(worker.scope) !== collectionCanonical(current.request.scope)
      || worker.setupDigest !== await collectionDigest({ attachmentIdentity: current.row.identity, mode: current.request.mode })
      || (database.accountId === intent.source.context.state.target.accountId && database.databaseId === intent.source.context.state.target.databaseId)) throw conflict()
    const binding = { version: 1, ...reference, destinationGeneration: intent.destination.generation,
      resourceRequestDigest: current.row.request_digest, physical }
    const bindingDigest = await collectionDigest(binding)
    const existing = (await db.query<{ binding: unknown, binding_digest: string }>(
      'SELECT binding,binding_digest FROM page_studio_managed_transfer_resource_bindings WHERE operation_id=$1', [reference.operationId])).rows[0]
    if (existing) {
      if (existing.binding_digest !== bindingDigest || collectionCanonical(existing.binding) !== collectionCanonical(binding)
        || await collectionDigest(existing.binding) !== existing.binding_digest) throw conflict()
    } else {
      try {
        await db.query(`INSERT INTO page_studio_managed_transfer_resource_bindings
          (operation_id,intent_digest,destination_generation,account_id,database_id,namespace,script_name,binding,binding_digest)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
        [reference.operationId, reference.intentDigest, intent.destination.generation, database.accountId, database.databaseId,
          worker.namespace, worker.scriptName, JSON.stringify(binding), bindingDigest])
      } catch (error) {
        if ((error as { code?: string })?.code === '23505') throw conflict()
        throw error
      }
    }
    return { ...reference, state: 'resources-bound' as const, bindingDigest }
  }, options)
}

const Control = ManagedTransferReferenceSchema.extend({ action: z.enum(['status', 'start', 'resume', 'verify']) }).strict()
const Progress = z.union([
  ManagedTransferReferenceSchema.extend({ state: z.enum(['not-started', 'preparing', 'resume-required', 'disabled']) }).strict(),
  ManagedTransferReferenceSchema.extend({ state: z.literal('prepared'), preparationId: z.string().uuid(),
    proofDigest: z.string().regex(/^[a-f0-9]{64}$/), resourceIdentity: z.string().regex(/^cms_attach_[a-f0-9]{64}$/) }).strict()
])
export const ManagedTransferResourceBindingSchema = ManagedTransferReferenceSchema.extend({ version: z.literal(1), destinationGeneration: z.string().uuid(),
  resourceRequestDigest: z.string().regex(/^[a-f0-9]{64}$/), physical: ManagedTransferPhysicalResourcesSchema }).strict()

/** Native resource phase, private until the complete transfer workflow is ready.
 * Status reads never reserve, allocate, inspect or resume. Prepared means private
 * provider preparation; only explicit verification retains a native binding.
 * That binding is not an authoring switch, current physical health or publication.
 */
export async function coordinateManagedTransferResources(input: unknown, dependencies: Dependencies & {
  env: Record<string, unknown>
  artifacts: unknown
  provider: unknown
}) {
  const parsed = Control.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid managed transfer resource action' })
  const { action, ...reference } = parsed.data
  const unavailable = () => createError({ statusCode: 503, statusMessage: 'Production transfer resources are unavailable' })
  if (dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') throw unavailable()
  const options = { runTransaction: dependencies.runTransaction }
  const artifacts = structuredClone(dependencies.artifacts), provider = structuredClone(dependencies.provider)
  const service = dependencies.env.PAGE_STUDIO_PROVISIONER as Record<string, (...args: unknown[]) => Promise<unknown>> | undefined
  const name = action === 'status'
    ? 'readManagedTransferResources'
    : action === 'verify' ? 'inspectManagedTransferResources' : 'prepareManagedTransferResources'
  // Capture the trusted binding method before any awaited SQL or remote work.
  const method = service?.[name]
  const remote = typeof method === 'function' ? method.bind(service) : null
  const read = () => withReservedManagedTransfer(reference, async (db, intent) => {
    const row = (await db.query<Row>('SELECT intent_digest,request,request_digest,identity FROM page_studio_managed_transfer_resources WHERE operation_id=$1', [reference.operationId])).rows[0]
    const request = row ? await check(row, reference.intentDigest) : null
    const retained = (await db.query<{ binding: unknown, binding_digest: string }>(
      'SELECT binding,binding_digest FROM page_studio_managed_transfer_resource_bindings WHERE operation_id=$1', [reference.operationId])).rows[0]
    if (retained) {
      const binding = ManagedTransferResourceBindingSchema.safeParse(retained.binding)
      if (!row || !binding.success || await collectionDigest(binding.data) !== retained.binding_digest
        || binding.data.operationId !== reference.operationId || binding.data.intentDigest !== reference.intentDigest
        || binding.data.destinationGeneration !== intent.destination.generation
        || binding.data.resourceRequestDigest !== row.request_digest || binding.data.physical.resourceIdentity !== row.identity) throw conflict()
    }
    return { request, identity: row?.identity, bound: Boolean(retained) }
  }, options)
  const result = (state: string) => ({ operationId: reference.operationId, state })
  let original = await read()
  if (original.bound && action !== 'verify') return result('resources-bound')
  if (!original.request && action === 'status') return result('not-started')
  if (!original.request && action !== 'start') throw conflict()
  if (!remote) throw unavailable()
  if (action === 'verify') {
    await bindManagedTransferResources(reference, { ...options, provider, inspect: remote })
    return result('resources-bound')
  }
  if (action === 'start') {
    await prepareManagedTransferResources(reference, { ...options, artifacts })
    original = await read()
    if (original.bound) return result('resources-bound')
  }
  if (!original.request) throw conflict()
  // No native SQL transaction is held across this service-binding call. The
  // executor independently rechecks admission around its provider operations.
  const request = { ...reference, resourceRequest: structuredClone(original.request) }
  const observed = await (action === 'status' ? remote(request) : remote(request, action))
  const progress = Progress.safeParse(observed)
  if (!progress.success || progress.data.operationId !== reference.operationId || progress.data.intentDigest !== reference.intentDigest
    || (progress.data.state === 'prepared' && progress.data.resourceIdentity !== original.identity)) throw conflict()
  const current = await read()
  if (collectionCanonical(current.request) !== collectionCanonical(original.request)) throw conflict()
  return result(current.bound ? 'resources-bound' : progress.data.state)
}
