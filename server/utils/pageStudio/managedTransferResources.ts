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
