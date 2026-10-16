import { createError } from 'h3'
import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ContentAttachmentRequestSchema, contentAttachmentIdentity } from '~~/shared/pageStudio/content-attachment'
import { ManagedTransferDestinationCatalogueAuthorizationSchema as Authorization,
  requireMatchingManagedTransferDestinationCatalogueRequest as matchingRequest } from '~~/shared/pageStudio/managed-transfer-destination-catalogue'
import { ManagedTransferReferenceSchema as Reference, withReservedManagedTransfer } from './managedTransferIntent'
import { ManagedTransferResourceBindingSchema } from './managedTransferResources'
import type { PageStudioQueryClient, RunPageStudioTransaction } from './sites'

type Intent = Parameters<Parameters<typeof withReservedManagedTransfer>[1]>[1]
type Dependencies = { runTransaction?: RunPageStudioTransaction }
const denied = () => createError({ statusCode: 403, statusMessage: 'Managed destination catalogue access denied' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Managed destination catalogue preparation changed' })

/** Caller holds the original transfer authority and site lock. The immutable
 * resource request and binding are both required; an active route is not proof. */
async function retainedResources(db: PageStudioQueryClient, intent: Intent) {
  const row = (await db.query<{ intent_digest: string, request: unknown, request_digest: string, identity: string }>(
    'SELECT intent_digest,request,request_digest,identity FROM page_studio_managed_transfer_resources WHERE operation_id=$1', [intent.operationId])).rows[0]
  const retained = (await db.query<{
    intent_digest: string
    destination_generation: string
    account_id: string
    database_id: string
    namespace: string
    script_name: string
    binding: unknown
    binding_digest: string
  }>(
    `SELECT intent_digest,destination_generation,account_id,database_id,namespace,script_name,binding,binding_digest
      FROM page_studio_managed_transfer_resource_bindings WHERE operation_id=$1`, [intent.operationId])).rows[0]
  if (!row || !retained) throw conflict()
  const resource = ContentAttachmentRequestSchema.safeParse(row.request)
  const binding = ManagedTransferResourceBindingSchema.safeParse(retained.binding)
  const intentDigest = await collectionDigest(intent)
  if (!resource.success || row.intent_digest !== intentDigest || row.request_digest !== await collectionDigest(resource.data)
    || row.identity !== await contentAttachmentIdentity(resource.data)) throw denied()
  if (!binding.success || await collectionDigest(binding.data) !== retained.binding_digest
    || binding.data.operationId !== intent.operationId || binding.data.intentDigest !== intentDigest
    || retained.intent_digest !== intentDigest || binding.data.destinationGeneration !== intent.destination.generation
    || retained.destination_generation !== intent.destination.generation || binding.data.resourceRequestDigest !== row.request_digest
    || binding.data.physical.resourceIdentity !== row.identity) throw conflict()
  const physical = binding.data.physical
  if (retained.account_id !== physical.database.accountId || retained.database_id !== physical.database.databaseId
    || retained.namespace !== physical.worker.namespace || retained.script_name !== physical.worker.scriptName
    || canonical(resource.data.scope) !== canonical(intent.authority.destination)
    || canonical(resource.data.anchor) !== canonical({ checkpointId: intent.source.checkpoint.id, digest: intent.source.checkpoint.digest })
    || (physical.database.accountId === intent.source.context.state.target.accountId
      && physical.database.databaseId === intent.source.context.state.target.databaseId)) throw conflict()
  const original = (await db.query<{ request: { authority: { operator: { actorId: string, loginSessionHash: string } } } }>(
    'SELECT request FROM page_studio_managed_transfer_intents WHERE operation_id=$1', [intent.operationId])).rows[0]
  const operator = original?.request.authority.operator
  if (!operator || canonical(resource.data.actor) !== canonical({ kind: 'agency-user', userId: operator.actorId, loginSessionHash: operator.loginSessionHash })) throw denied()
  try {
    return await matchingRequest({ formatVersion: 1, operationId: intent.operationId, intentDigest,
      resourceRequest: { operationId: intent.operationId, intentDigest, resourceRequest: resource.data }, baseline: physical })
  } catch { throw conflict() }
}
export async function retainedManagedTransferDestinationCatalogue(db: PageStudioQueryClient, intent: Intent) {
  const expected = await retainedResources(db, intent)
  const row = (await db.query<{ intent_digest: string, request: unknown, request_digest: string }>(
    'SELECT intent_digest,request,request_digest FROM page_studio_managed_transfer_destination_catalogues WHERE operation_id=$1', [intent.operationId])).rows[0]
  if (!row) return { expected, saved: null }
  let saved: Awaited<ReturnType<typeof matchingRequest>>
  try {
    saved = await matchingRequest(row.request)
  } catch { throw denied() }
  if (row.intent_digest !== expected.intentDigest || await collectionDigest(saved) !== row.request_digest) throw denied()
  if (canonical(saved) !== canonical(expected)) throw conflict()
  return { expected, saved }
}

/** Save native catalogue authority before any destination DDL. Derives all
 * physical identities from retained resources. No remote inspection, schema
 * installation, completion, destination selection or customer-facing action. */
export async function prepareManagedTransferDestinationCatalogue(input: unknown, dependencies: Dependencies & { env: Record<string, unknown> }) {
  const parsed = Reference.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid managed transfer reference' })
  if (dependencies.env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT !== 'production') {
    throw createError({ statusCode: 503, statusMessage: 'Production destination catalogue preparation is unavailable' })
  }
  return withReservedManagedTransfer(parsed.data, async (db, intent) => {
    const current = await retainedManagedTransferDestinationCatalogue(db, intent)
    if (!current.saved) {
      await db.query(`INSERT INTO page_studio_managed_transfer_destination_catalogues(operation_id,intent_digest,request,request_digest)
        VALUES($1,$2,$3::jsonb,$4)`, [intent.operationId, parsed.data.intentDigest, JSON.stringify(current.expected), await collectionDigest(current.expected)])
    }
    return current.expected
  }, dependencies)
}

/** Machine callback only. Each invocation rechecks the original sessions,
 * source heads, plan and exact retained private resource binding. Studio must
 * independently recheck physical ownership and current preparation per effect. */
export async function authorizeManagedTransferDestinationCatalogue(input: unknown, dependencies: Dependencies = {}) {
  const parsed = Authorization.safeParse(input)
  if (!parsed.success) throw denied()
  const auth = parsed.data, { operationId, intentDigest } = auth.request
  return withReservedManagedTransfer({ operationId, intentDigest }, async (db, intent) => {
    const current = await retainedManagedTransferDestinationCatalogue(db, intent)
    if (!current.saved || canonical(current.saved) !== canonical(auth.request)) throw denied()
    return auth
  }, dependencies)
}
