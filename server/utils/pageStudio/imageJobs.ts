import { z } from 'zod'
import { ImageAssetSchema, ImageJobReceiptSchema, ImageLibraryRequestSchema, ImageQuoteSchema, type ImageActorSchema, type ImageQuote, type ImageJobReceipt } from '~~/shared/pageStudio/imageGeneration'
import { PageStudioContentScopeSchema, type PageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { PageStudioSessionClaimsSchema } from './sessions'
import type { PageStudioControlQueryClient } from './controlStore'
import { ImageCreditError, lockImageCreditWallet, reserveImageCredits, finishImageCredits } from './imageCredits'
import { readImageQuote } from './imageQuoteStore'

export const ImageJobPrincipalSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('native-login'), login: z.object({ role: z.enum(['agency', 'client']), userId: z.string().min(1).max(128),
    tokenHash: z.string().regex(/^[a-f0-9]{64}$/), issuedAt: z.string().datetime(), expiresAt: z.string().datetime() }).strict() }).strict(),
  z.object({ source: z.literal('studio-session'), claims: PageStudioSessionClaimsSchema }).strict()
])
export type ImageJobPrincipal = z.infer<typeof ImageJobPrincipalSchema>
type Row = {
  job_id: string
  quote_id: string
  state: ImageJobReceipt['state']
  quote: unknown
  principal: unknown
  dispatch_token_hash: string | null
  asset: unknown
  failure_code: string | null
  created_at: string
  dispatch_expired: boolean
}
const notFound = () => new ImageCreditError('IMAGE_JOB_NOT_FOUND', 404, 'Image generation not found')
const conflict = () => new ImageCreditError('IMAGE_JOB_CONFLICT', 409, 'This generation has a different saved outcome')
const invalid = () => new ImageCreditError('IMAGE_JOB_INVALID', 400, 'Invalid generation request')
const denied = () => new ImageCreditError('IMAGE_JOB_DENIED', 403, 'Image generation callback denied')
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw invalid()
  return result.data
}
function key(input: PageStudioContentScope) {
  const scope = parse(PageStudioContentScopeSchema, input)
  return [scope.tenantId, scope.clientId, scope.siteId, scope.environment]
}
function wallet(scope: PageStudioContentScope) {
  if (scope.environment === 'preview') throw invalid()
  return { tenantId: scope.tenantId, clientId: scope.clientId, environment: scope.environment }
}
const columns = `job.job_id,job.quote_id,job.state,quote.quote,job.principal,job.dispatch_token_hash,job.asset,job.failure_code,job.created_at<clock_timestamp()-INTERVAL '10 minutes' AS dispatch_expired,
  to_char(job.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`
const from = `FROM page_studio_image_jobs job JOIN page_studio_image_quotes quote ON quote.quote_id=job.quote_id`
const where = `job.tenant_id=$1 AND job.client_id=$2 AND job.site_id=$3 AND job.environment=$4`
async function row(db: PageStudioControlQueryClient, scope: PageStudioContentScope, jobId: string, lock = false): Promise<Row | undefined> {
  if (!z.string().uuid().safeParse(jobId).success) throw notFound()
  return (await db.query<Row>(`SELECT ${columns} ${from} WHERE ${where} AND job.job_id=$5 ${lock ? 'FOR UPDATE OF job' : ''}`, [...key(scope), jobId])).rows[0]
}
function receipt(saved: Row): ImageJobReceipt {
  const quote = ImageQuoteSchema.parse(saved.quote)
  return ImageJobReceiptSchema.parse({ jobId: saved.job_id, quoteId: saved.quote_id, state: saved.state, modelId: quote.modelId,
    credits: quote.credits, createdAt: saved.created_at, asset: saved.asset, failureCode: saved.failure_code })
}
async function event(db: PageStudioControlQueryClient, jobId: string, state: ImageJobReceipt['state']) {
  await db.query('INSERT INTO page_studio_image_job_events(job_id,state) VALUES($1,$2) ON CONFLICT DO NOTHING', [jobId, state])
}
/** All mutations are trusted primitives inside a caller-owned non-retrying
 * transaction. Native authority comes first, wallet then job; no provider I/O. */
export async function createImageJob(db: PageStudioControlQueryClient, scope: PageStudioContentScope, actor: z.infer<typeof ImageActorSchema>, quoteId: string, input: ImageJobPrincipal): Promise<ImageJobReceipt> {
  await lockImageCreditWallet(db, wallet(scope))
  const existing = await row(db, scope, quoteId, true)
  if (existing) {
    const q = ImageQuoteSchema.parse(existing.quote)
    if (q.actor.actorId !== actor.actorId || q.actor.actorRole !== actor.actorRole) throw notFound()
    return receipt(existing)
  }
  // Read expiry after the wallet wait, not before it.
  const quote = await readImageQuote(db, scope, actor, quoteId)
  const principal = parse(ImageJobPrincipalSchema, input)
  if (principal.source === 'native-login') {
    if (principal.login.userId !== actor.actorId || principal.login.role !== actor.actorRole) throw denied()
  } else if (principal.claims.userId !== actor.actorId || principal.claims.role !== actor.actorRole || principal.claims.tenantId !== scope.tenantId
    || principal.claims.clientId !== scope.clientId || principal.claims.siteId !== scope.siteId) throw denied()
  const active = (await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM page_studio_image_jobs
    WHERE tenant_id=$1 AND client_id=$2 AND environment=$3 AND state IN ('queued','dispatched','reconciliation')`,
  [scope.tenantId, scope.clientId, scope.environment])).rows[0]?.count ?? 0
  if (active >= 3) throw new ImageCreditError('IMAGE_JOBS_BUSY', 429, 'Wait for an active image generation to finish before starting another')
  await reserveImageCredits(db, wallet(scope), { reservationId: quoteId, siteId: scope.siteId, actorId: actor.actorId, actorRole: actor.actorRole, credits: quote.credits, fingerprint: quote.fingerprint })
  await db.query(`INSERT INTO page_studio_image_jobs(job_id,quote_id,tenant_id,client_id,site_id,environment,actor_role,actor_id,principal)
    VALUES($5,$5,$1,$2,$3,$4,$6,$7,$8::jsonb)`, [...key(scope), quoteId, actor.actorRole, actor.actorId, JSON.stringify(principal)])
  await event(db, quoteId, 'queued')
  return readImageJob(db, scope, quoteId)
}
export async function readImageJob(db: PageStudioControlQueryClient, scope: PageStudioContentScope, jobId: string): Promise<ImageJobReceipt> {
  const saved = await row(db, scope, jobId)
  if (!saved) throw notFound()
  return receipt(saved)
}
/** Private service discovery only; caller must verify current principal before
 * claim. Never include this result in a browser/editor response. */
export async function readImageJobAuthority(db: PageStudioControlQueryClient, scope: PageStudioContentScope, jobId: string) {
  const saved = await row(db, scope, jobId)
  if (!saved) throw notFound()
  return { principal: ImageJobPrincipalSchema.parse(saved.principal), quote: ImageQuoteSchema.parse(saved.quote), state: saved.state }
}
export async function claimImageJob(db: PageStudioControlQueryClient, scope: PageStudioContentScope, jobId: string): Promise<{ admitted: false } | { admitted: true, quote: ImageQuote, dispatchToken: string }> {
  if (!await row(db, scope, jobId)) throw notFound()
  await lockImageCreditWallet(db, wallet(scope))
  const saved = await row(db, scope, jobId, true)
  if (!saved) throw notFound()
  if (saved.state !== 'queued') return { admitted: false }
  if (saved.dispatch_expired) {
    await cancelQueuedImageJob(db, scope, jobId, 'dispatch-expired')
    return { admitted: false }
  }
  const dispatchToken = crypto.randomUUID()
  await db.query(`UPDATE page_studio_image_jobs SET state='dispatched',dispatch_token_hash=$2,dispatched_at=clock_timestamp() WHERE job_id=$1`, [jobId, await collectionDigest(dispatchToken)])
  await event(db, jobId, 'dispatched')
  return { admitted: true, quote: ImageQuoteSchema.parse(saved.quote), dispatchToken }
}
async function callback(db: PageStudioControlQueryClient, scope: PageStudioContentScope, jobId: string, token: string) {
  if (!await row(db, scope, jobId)) throw notFound()
  await lockImageCreditWallet(db, wallet(scope))
  const saved = await row(db, scope, jobId, true)
  if (!saved) throw notFound()
  if (!z.string().uuid().safeParse(token).success || saved.dispatch_token_hash !== await collectionDigest(token)) throw denied()
  return saved
}
export async function completeImageJob(db: PageStudioControlQueryClient, scope: PageStudioContentScope, jobId: string, token: string, input: unknown) {
  const asset = parse(ImageAssetSchema, input)
  const saved = await callback(db, scope, jobId, token)
  if (saved.state === 'succeeded') {
    if (await collectionDigest(saved.asset) !== await collectionDigest(asset)) throw conflict()
    return receipt(saved)
  }
  if (!['dispatched', 'reconciliation'].includes(saved.state)) throw conflict()
  const quote = ImageQuoteSchema.parse(saved.quote)
  if (quote.dimensions && (quote.dimensions.width !== asset.width || quote.dimensions.height !== asset.height)) throw invalid()
  await finishImageCredits(db, wallet(scope), jobId, 'settled')
  await db.query('UPDATE page_studio_image_jobs SET state=\'succeeded\',asset=$2::jsonb,finished_at=clock_timestamp() WHERE job_id=$1', [jobId, JSON.stringify(asset)])
  await event(db, jobId, 'succeeded')
  return readImageJob(db, scope, jobId)
}
export async function failImageJob(db: PageStudioControlQueryClient, scope: PageStudioContentScope, jobId: string, token: string, input: 'provider-rejected' | 'invalid-output') {
  const reason = parse(z.enum(['provider-rejected', 'invalid-output']), input)
  const saved = await callback(db, scope, jobId, token)
  if (saved.state === 'failed') {
    if (saved.failure_code !== reason) throw conflict()
    return receipt(saved)
  }
  if (!['dispatched', 'reconciliation'].includes(saved.state)) throw conflict()
  await finishImageCredits(db, wallet(scope), jobId, 'released')
  await db.query('UPDATE page_studio_image_jobs SET state=\'failed\',failure_code=$2,finished_at=clock_timestamp() WHERE job_id=$1', [jobId, reason])
  await event(db, jobId, 'failed')
  return readImageJob(db, scope, jobId)
}
export async function markImageJobUncertain(db: PageStudioControlQueryClient, scope: PageStudioContentScope, jobId: string, token: string) {
  const saved = await callback(db, scope, jobId, token)
  if (saved.state !== 'dispatched') return receipt(saved)
  await db.query('UPDATE page_studio_image_jobs SET state=\'reconciliation\' WHERE job_id=$1', [jobId])
  await event(db, jobId, 'reconciliation')
  return readImageJob(db, scope, jobId)
}
async function listImageJobs(db: PageStudioControlQueryClient, scope: PageStudioContentScope, input: z.input<typeof ImageLibraryRequestSchema>, succeededOnly: boolean) {
  const options = parse(ImageLibraryRequestSchema, input)
  const rows = (await db.query<Row>(`SELECT ${columns} ${from} WHERE ${where} ${succeededOnly ? 'AND job.state=\'succeeded\'' : ''}
    AND ($5::timestamptz IS NULL OR (job.created_at,job.job_id)<($5::timestamptz,$6::uuid))
    ORDER BY job.created_at DESC,job.job_id DESC LIMIT $7`, [...key(scope), options.before?.createdAt ?? null, options.before?.jobId ?? null, options.limit + 1])).rows
  const items = rows.slice(0, options.limit).map(receipt)
  const last = items.at(-1)
  return { items, nextCursor: rows.length > options.limit && last ? { createdAt: last.createdAt, jobId: last.jobId } : null }
}
/** Scope allowlist and private worker authentication are required at transport.
 * Delivery only updates the outbox; it never takes wallet locks or claims work. */
export async function takeImageDispatchBatch(db: PageStudioControlQueryClient, scope: PageStudioContentScope, limit: number) {
  parse(z.number().int().min(1).max(20), limit)
  const rows = (await db.query<{ job_id: string }>(`WITH ready AS (
    SELECT job.job_id FROM page_studio_image_jobs job WHERE ${where} AND state='queued' AND next_delivery_at<=clock_timestamp()
    ORDER BY next_delivery_at,job_id LIMIT $5 FOR UPDATE SKIP LOCKED
  ) UPDATE page_studio_image_jobs job SET next_delivery_at=clock_timestamp()+INTERVAL '30 seconds',delivery_attempts=delivery_attempts+1
    FROM ready WHERE job.job_id=ready.job_id RETURNING job.job_id`, [...key(scope), limit])).rows
  return rows.map(value => ({ jobId: value.job_id, scope }))
}

/** Only a private service may cancel known-unstarted work. A racing claim wins
 * or loses under the wallet/job locks; this cannot release dispatched spend. */
export async function cancelQueuedImageJob(db: PageStudioControlQueryClient, scope: PageStudioContentScope, jobId: string, input: 'authority-revoked' | 'dispatch-expired') {
  const reason = parse(z.enum(['authority-revoked', 'dispatch-expired']), input)
  if (!await row(db, scope, jobId)) throw notFound()
  await lockImageCreditWallet(db, wallet(scope))
  const saved = await row(db, scope, jobId, true)
  if (!saved) throw notFound()
  if (saved.state !== 'queued') return receipt(saved)
  await finishImageCredits(db, wallet(scope), jobId, 'released')
  await db.query('UPDATE page_studio_image_jobs SET state=\'failed\',failure_code=$2,finished_at=clock_timestamp() WHERE job_id=$1', [jobId, reason])
  await event(db, jobId, 'failed')
  return readImageJob(db, scope, jobId)
}
/** Reconciliation redelivers only an R2-receipt lookup, never a provider claim.
 * No token is exposed here; the private worker reads it from its durable receipt.
 * Missing receipt remains uncertain and reserved, requiring operator evidence. */
export async function recoverStaleImageJobs(db: PageStudioControlQueryClient, scope: PageStudioContentScope) {
  await lockImageCreditWallet(db, wallet(scope))
  const rows = (await db.query<{ job_id: string, state: string }>(`SELECT job_id,state FROM page_studio_image_jobs job WHERE ${where}
    AND ((state='dispatched' AND dispatched_at<clock_timestamp()-INTERVAL '5 minutes') OR state='reconciliation')
    AND next_delivery_at<=clock_timestamp() ORDER BY next_delivery_at,job_id LIMIT 20 FOR UPDATE SKIP LOCKED`, key(scope))).rows
  for (const saved of rows) {
    await db.query('UPDATE page_studio_image_jobs SET state=\'reconciliation\',next_delivery_at=clock_timestamp()+INTERVAL \'60 seconds\' WHERE job_id=$1', [saved.job_id])
    await event(db, saved.job_id, 'reconciliation')
  }
  return rows.map(saved => ({ jobId: saved.job_id, scope }))
}

export const readImageLibrary = (db: PageStudioControlQueryClient, scope: PageStudioContentScope, input: z.input<typeof ImageLibraryRequestSchema>) => listImageJobs(db, scope, input, true)
export const readImageJobs = (db: PageStudioControlQueryClient, scope: PageStudioContentScope, input: z.input<typeof ImageLibraryRequestSchema>) => listImageJobs(db, scope, input, false)

/** Expiry is independent of current model configuration or initiating login.
 * Only queued work is refundable here; dispatched work remains reserved. */
export async function expireQueuedImageJobs(db: PageStudioControlQueryClient, scope: PageStudioContentScope) {
  await lockImageCreditWallet(db, wallet(scope))
  const rows = (await db.query<{ job_id: string }>(`SELECT job_id FROM page_studio_image_jobs job WHERE ${where}
    AND state='queued' AND created_at<clock_timestamp()-INTERVAL '10 minutes'
    ORDER BY created_at,job_id LIMIT 20 FOR UPDATE SKIP LOCKED`, key(scope))).rows
  for (const saved of rows) await cancelQueuedImageJob(db, scope, saved.job_id, 'dispatch-expired')
}
