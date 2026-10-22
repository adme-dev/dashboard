import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { ReleaseSha256Schema } from '~~/shared/pageStudio/cmsManaged'
import { assertSoleCmsAuthoringScope } from './cmsGraphRead'
import { decodeCmsObject, lockCmsContext } from './cmsVisibility'
import { ManagedTransferAuthorityInputSchema, withManagedTransferAuthority, type ManagedTransferAuthority } from './managedTransferAuthority'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'

const Request = z.object({
  operationId: z.string().uuid(), authority: ManagedTransferAuthorityInputSchema, expectedSourceDigest: ReleaseSha256Schema
}).strict()
type Dependencies = { runTransaction?: RunPageStudioTransaction }
const conflict = () => createError({ statusCode: 409, statusMessage: 'The transfer source or request changed. Review the current website before continuing.' })
const equal = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
const Checkpoint = z.object({ id: z.string().min(1).max(128), digest: ReleaseSha256Schema, object_key: z.string().min(1).max(1024) }).strict()
const Head = z.object({ collection_id: z.string().min(1), record_id: z.string().min(1), object_id: z.string().uuid() }).strict()

/** Native metadata, never D1 latest. The caller holds transfer authority and the
 * site lock. Include accepted history as well as selected heads: advancing a
 * logical clock then restoring its head cannot pass the final compare-and-swap.
 * This is not a remote body/graph proof; the later worker phase must supply one.
 */
async function captureSource(db: PageStudioQueryClient, authority: ManagedTransferAuthority) {
  try {
    const scope = authority.source
    await assertSoleCmsAuthoringScope(db, scope)
    const context = await lockCmsContext(db, scope)
    context.selections.sort((a, b) => a.collection_id < b.collection_id ? -1 : a.collection_id > b.collection_id ? 1 : 0)
    const checkpointRows = (await db.query(`SELECT cp.id,cp.digest,cp.object_key
      FROM page_studio_sites site JOIN page_studio_checkpoints cp
        ON cp.tenant_id=site.tenant_id AND cp.client_id=site.client_id AND cp.site_id=site.id AND cp.id=site.current_checkpoint_id
      WHERE site.tenant_id=$1 AND site.client_id=$2 AND site.id=$3`, [scope.tenantId, scope.clientId, scope.siteId])).rows
    const checkpoint = Checkpoint.parse(checkpointRows.length === 1 ? checkpointRows[0] : null)
    if (!equal({ id: checkpoint.id, digest: checkpoint.digest }, context.application.manifest.checkpoint)
      || checkpoint.object_key !== `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${checkpoint.id}.json`) throw conflict()
    // Bounded metadata only. Fail before creating an intent for unsupported size.
    const rows = (await db.query(`SELECT * FROM page_studio_cms_objects WHERE scope_key=$1 AND generation=$2
      ORDER BY kind COLLATE "C",collection_id COLLATE "C",record_id COLLATE "C",logical_version LIMIT 1001`,
    [context.state.scope_key, context.state.active_generation])).rows
    const heads = (await db.query(`SELECT collection_id,record_id,object_id FROM page_studio_cms_record_heads
      WHERE scope_key=$1 AND generation=$2 ORDER BY collection_id COLLATE "C",record_id COLLATE "C" LIMIT 1001`,
    [context.state.scope_key, context.state.active_generation])).rows
    if (rows.length > 1000 || heads.length > 1000) throw createError({ statusCode: 413, statusMessage: 'This website needs a larger managed transfer review.' })
    const objects = rows.map(row => decodeCmsObject(row, context))
    for (const selection of context.selections) {
      if (!objects.some(item => item.id === selection.object_id && item.pin.kind === 'schema' && item.pin.collectionId === selection.collection_id)) throw conflict()
    }
    if (context.state.current_content_id && !objects.some(item => item.id === context.state.current_content_id && item.pin.kind === 'content')) throw conflict()
    const recordHeads = heads.map((row) => {
      const head = Head.parse(row)
      if (!objects.some(item => item.id === head.object_id && item.pin.kind === 'record'
        && item.pin.collectionId === head.collection_id && item.pin.recordId === head.record_id)) throw conflict()
      return { collectionId: head.collection_id, recordId: head.record_id, objectId: head.object_id }
    })
    const source = { context, checkpoint, objects, recordHeads }
    if (new TextEncoder().encode(collectionCanonical(source)).byteLength > 1_500_000) throw createError({ statusCode: 413, statusMessage: 'This website needs a larger managed transfer review.' })
    return source
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 413) throw error
    // Preserve contention signals for the outer transfer authority boundary.
    if (['55P03', '40P01', '57014'].includes(String((error as { code?: string })?.code))) throw error
    throw conflict()
  }
}

/** Read-only review challenge, with no credential or private object metadata. */
export async function reviewManagedTransferSource(authorityInput: unknown, dependencies: Dependencies = {}) {
  return withManagedTransferAuthority(authorityInput, async (db, authority) => {
    const source = await captureSource(db, authority)
    return { sourceDigest: await collectionDigest({ authority, source }), checkpointId: source.checkpoint.id,
      applicationId: source.context.application.id, objectCount: source.objects.length }
  }, dependencies)
}

interface StoredIntent {
  operation_id: string
  request: unknown
  intent: {
    formatVersion: 1
    operationId: string
    authority: ManagedTransferAuthority
    sourceDigest: string
    source: Awaited<ReturnType<typeof captureSource>>
    destination: { environment: 'production', generation: string, requestKey: string }
  }
  intent_digest: string
}
function receipt(row: StoredIntent) {
  return { operationId: row.operation_id, state: 'reserved' as const, sourceDigest: row.intent.sourceDigest,
    intentDigest: row.intent_digest, destinationGeneration: row.intent.destination.generation }
}

/** Save-before-side-effect boundary. Internal only, not a public transfer route.
 * No source fence, schema installation or provider call is permitted here. The
 * destination is only a reserved identity; resource allocation and a separately
 * verified immutable resource binding are still required before copying.
 * Source, original principals and exact plan survive lost acknowledgements.
 */
export async function reserveManagedTransferIntent(input: unknown, dependencies: Dependencies = {}) {
  const parsed = Request.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid managed transfer request' })
  const request = parsed.data
  return withManagedTransferAuthority(request.authority, async (db, authority) => {
    const source = await captureSource(db, authority)
    const sourceDigest = await collectionDigest({ authority, source })
    if (sourceDigest !== request.expectedSourceDigest) throw conflict()
    const existing = (await db.query<StoredIntent>(`SELECT operation_id,request,intent,intent_digest
      FROM page_studio_managed_transfer_intents WHERE site_id=$1 OR operation_id=$2`, [authority.source.siteId, request.operationId])).rows
    if (existing.length) {
      const row = existing[0]!
      if (existing.length !== 1 || row.operation_id !== request.operationId || !equal(row.request, request)
        || !equal(row.intent.authority, authority) || !equal(row.intent.source, source)
        || row.intent.sourceDigest !== sourceDigest || await collectionDigest(row.intent) !== row.intent_digest) throw conflict()
      return receipt(row)
    }
    const intent: StoredIntent['intent'] = { formatVersion: 1, operationId: request.operationId, authority, sourceDigest, source,
      destination: { environment: 'production', generation: randomUUID(), requestKey: `transfer_${request.operationId}` } }
    const intentDigest = await collectionDigest(intent)
    try {
      await db.query(`INSERT INTO page_studio_managed_transfer_intents
        (operation_id,tenant_id,client_id,site_id,source_scope_key,source_generation,destination_generation,entitlement_id,request,intent,intent_digest)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)`,
      [request.operationId, authority.source.tenantId, authority.source.clientId, authority.source.siteId,
        source.context.state.scope_key, source.context.state.active_generation, intent.destination.generation, authority.entitlementId,
        JSON.stringify(request), JSON.stringify(intent), intentDigest])
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') throw conflict()
      throw error
    }
    return receipt({ operation_id: request.operationId, request, intent, intent_digest: intentDigest })
  }, dependencies)
}

export const ManagedTransferReferenceSchema = z.object({
  operationId: z.string().uuid(), intentDigest: ReleaseSha256Schema
}).strict()

/** Original intent and principal only, including after a committed handoff.
 * Terminal callers must separately enforce the source CAS before selection and
 * their exact completion receipt on recovery. This is not storage admission.
 * SQL-only: the original authority and site lock span work and final checks.
 */
export async function withManagedTransferIntentAuthority<T>(input: unknown,
  work: (db: PageStudioQueryClient, intent: StoredIntent['intent']) => Promise<T>,
  dependencies: Dependencies = {}
): Promise<T> {
  const parsed = ManagedTransferReferenceSchema.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid managed transfer reference' })
  const denied = () => createError({ statusCode: 403, statusMessage: 'The retained managed transfer is unavailable' })
  // This short initial read obtains private immutable authority inputs. Its
  // contents cannot authorize anything until the independent native checks.
  const run = dependencies.runTransaction ?? transactionWithoutRetry
  const row = await run(async db => (await db.query<StoredIntent>(
    'SELECT operation_id,request,intent,intent_digest FROM page_studio_managed_transfer_intents WHERE operation_id=$1',
    [parsed.data.operationId])).rows[0])
  if (!row || row.intent_digest !== parsed.data.intentDigest || await collectionDigest(row.intent) !== row.intent_digest) throw denied()
  const original = Request.safeParse(row.request)
  if (!original.success || original.data.operationId !== parsed.data.operationId
    || row.intent.operationId !== parsed.data.operationId || row.intent.formatVersion !== 1
    || row.intent.sourceDigest !== original.data.expectedSourceDigest
    || row.intent.destination.environment !== 'production'
    || row.intent.destination.requestKey !== `transfer_${parsed.data.operationId}`) throw denied()
  return withManagedTransferAuthority(original.data.authority, async (db, authority) => {
    if (!equal(authority, row.intent.authority)) throw conflict()
    // Any head permanently closes legacy admission, even revoked or corrupt
    // metadata. The migration serializes head writes with this same site lock.
    const legacy = async () => {
      if ((await db.query('SELECT 1 FROM page_studio_transfer_recovery_heads WHERE operation_id=$1',
        [parsed.data.operationId])).rows.length) throw denied()
    }
    await legacy()
    const result = await work(db, structuredClone(row.intent))
    await legacy()
    return result
  }, dependencies)
}

/** Caller holds original intent authority. Compare all original accepted clocks,
 * heads and graph selection immediately before a terminal native switch. */
export async function assertManagedTransferSource(db: PageStudioQueryClient, intent: StoredIntent['intent']) {
  const source = await captureSource(db, intent.authority)
  if (!equal(source, intent.source)
    || await collectionDigest({ authority: intent.authority, source }) !== intent.sourceDigest) throw conflict()
}

/** Nonterminal phases always require the exact original source both before and
 * after work. A terminal handoff cannot silently weaken this existing boundary. */
export async function withReservedManagedTransfer<T>(input: unknown,
  work: (db: PageStudioQueryClient, intent: StoredIntent['intent']) => Promise<T>,
  dependencies: Dependencies = {}
): Promise<T> {
  return withManagedTransferIntentAuthority(input, async (db, intent) => {
    await assertManagedTransferSource(db, intent)
    const result = await work(db, structuredClone(intent))
    await assertManagedTransferSource(db, intent)
    return result
  }, dependencies)
}
