import { createError } from 'h3'
import { z } from 'zod'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ContentAttachmentRequestSchema, contentAttachmentIdentity, requireMatchingContentAttachmentRequest, type ContentAttachmentRequest } from '~~/shared/pageStudio/content-attachment'
import { ManagedTransferReferenceSchema, withReservedManagedTransfer } from './managedTransferIntent'
import type { RunPageStudioTransaction } from './sites'

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
