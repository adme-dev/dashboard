import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { z } from 'zod'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { TransferControlsRequestSchema, TransferControlsViewSchema, TransferControlsValueSchema,
  type TransferControlsView, type TransferControlsRequest } from '~~/shared/pageStudio/transferControls'
import { reviewManagedTransferSource, reserveManagedTransferIntent, withManagedTransferIntentAuthority } from '~~/server/utils/pageStudio/managedTransferIntent'
import type { PageStudioQueryClient, PageStudioControlQueryClient, RunPageStudioTransaction } from '~~/shared/pageStudio/controlTypes'
import { runCmsDatabaseInvocation, transactionWithoutRetry } from './cmsDatabase'
import { assertOperator, assertOwnerIdentity, assertRevision, authorityInput, conflict, currentOwner, denied,
  equal, iso, operatorProof, readRequest, withOwnerMetadata, withRequestAuthority,
  type Operator, type TransferRequestRow } from './transferControlAuthority'

type Dependencies = { runTransaction: RunPageStudioTransaction }
type Runner = <T>(work: (db: PageStudioControlQueryClient) => Promise<T>) => Promise<T>
const postReservation = (row: TransferRequestRow) => ['reserving', 'reserved'].includes(row.state)
const op = (row: TransferRequestRow): Operator => {
  if (!row.operator_id || !row.operator_login_session_hash) throw denied()
  return { actorId: row.operator_id, loginSessionHash: row.operator_login_session_hash }
}
function projection(row: TransferRequestRow, audience: 'owner' | 'operator', currentMatches: boolean, valid: boolean): TransferControlsView {
  const state = row.state === 'revoked' ? 'revoked' : !valid ? (postReservation(row) ? 'needs-attention' : 'expired') : row.state
  const allowedActions: TransferControlsView['allowedActions'] = []
  if (valid && currentMatches) {
    if (audience === 'owner' && ['requested', 'reviewed', 'approved'].includes(row.state)) {
      if (row.state === 'reviewed') allowedActions.push('approve')
      allowedActions.push('revoke')
    }
    if (audience === 'operator') {
      if (['requested', 'reviewed'].includes(row.state)) allowedActions.push('review')
      if (['approved', 'reserving'].includes(row.state)) allowedActions.push('reserve')
    }
  }
  return TransferControlsViewSchema.parse({ requestId: row.request_id, siteId: row.site_id, revision: row.revision,
    state, review: row.review, expiresAt: iso(row.expires_at), allowedActions })
}
async function cas(db: PageStudioQueryClient, row: TransferRequestRow, set: string, values: unknown[]) {
  const updated = (await db.query<TransferRequestRow>(`UPDATE page_studio_transfer_requests SET ${set},revision=revision+1,updated_at=clock_timestamp()
    WHERE request_id=$1 AND revision=$2 RETURNING *`, [row.request_id, row.revision, ...values])).rows[0]
  if (!updated) throw conflict()
  return updated
}
async function snapshot(siteId: string, requestId: string, run: RunPageStudioTransaction) {
  return run(db => readRequest(db, siteId, requestId))
}
async function validOriginal(row: TransferRequestRow, db: PageStudioQueryClient) {
  if (row.state === 'revoked') return false
  if (!(await db.query('SELECT 1 WHERE $1::timestamptz>clock_timestamp()', [row.expires_at])).rows.length) return false
  try {
    if (!row.operator_id) {
      await withOwnerMetadata(row.site_id, row.owner_login_session_hash, async (_tx, authority, proof) => {
        if (authority.entitlementId !== row.entitlement_id || !equal(proof, row.owner_proof)) throw conflict()
      }, work => work(db))
    } else {
      await withRequestAuthority(row, op(row), async (tx) => {
        // A durable claim with no intent must not invite endless retry after its
        // approved source changed in the claim/intent transaction gap. Read only:
        // saved intents are inspected by identity, never reserved from status.
        if (row.state === 'reserving' && !await recoverIntent(tx, row)) {
          const source = await reviewManagedTransferSource(authorityInput(row), { runTransaction: work => work(tx) })
          if (source.sourceDigest !== row.source_digest) throw conflict()
        }
      }, work => work(db))
    }
    return true
  } catch (error) {
    if ([403, 409].includes((error as { statusCode: number }).statusCode)) return false
    throw error
  }
}
async function createRequest(request: Extract<TransferControlsRequest, { action: 'request' }>, run: RunPageStudioTransaction) {
  return withOwnerMetadata(request.siteId, request.ownerLoginSessionHash, async (db, authority, proof) => {
    const old = (await db.query<TransferRequestRow>('SELECT * FROM page_studio_transfer_requests WHERE request_id=$1 FOR UPDATE NOWAIT', [request.requestId])).rows[0]
    if (old) {
      assertOwnerIdentity(old, authority)
      if (old.site_id !== request.siteId || old.owner_login_session_hash !== request.ownerLoginSessionHash) throw denied()
      return projection(old, 'owner', true, await validOriginal(old, db))
    }
    const active = (await db.query<TransferRequestRow>(`SELECT * FROM page_studio_transfer_requests WHERE site_id=$1 AND state<>'revoked' FOR UPDATE NOWAIT`, [request.siteId])).rows[0]
    if (active) {
      assertOwnerIdentity(active, authority)
      if (postReservation(active) || await validOriginal(active, db)) throw conflict()
      await cas(db, active, 'state=\'revoked\',revoked_at=clock_timestamp()', [])
    }
    if ((await db.query('SELECT 1 FROM page_studio_managed_transfer_intents WHERE site_id=$1', [request.siteId])).rows.length) throw conflict()
    const row = (await db.query<TransferRequestRow>(`INSERT INTO page_studio_transfer_requests
      (request_id,site_id,entitlement_id,owner_account_id,owner_identity_id,workspace_id,owner_login_session_hash,owner_proof,operation_id,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING *`, [request.requestId, request.siteId,
      authority.entitlementId, authority.accountId, authority.identityId, authority.workspaceId, request.ownerLoginSessionHash,
      JSON.stringify(proof), randomUUID(), authority.expiresAt])).rows[0]!
    return projection(row, 'owner', true, true)
  }, run)
}
async function ownerStatus(request: Extract<TransferControlsRequest, { action: 'owner-status' }>, run: RunPageStudioTransaction) {
  return run(async (db) => {
    const owner = await currentOwner(db, request.siteId, request.ownerLoginSessionHash)
    const row = (await db.query<TransferRequestRow>(`SELECT * FROM page_studio_transfer_requests WHERE site_id=$1
      ORDER BY (state<>'revoked') DESC,created_at DESC,request_id DESC LIMIT 1`, [request.siteId])).rows[0]
    if (!row) return null
    assertOwnerIdentity(row, owner)
    const result = projection(row, 'owner', row.owner_login_session_hash === request.ownerLoginSessionHash, await validOriginal(row, db))
    if (!equal(owner, await currentOwner(db, request.siteId, request.ownerLoginSessionHash))) throw denied()
    return result
  })
}
async function operatorStatus(request: Extract<TransferControlsRequest, { action: 'operator-status' | 'operator-list' }>, run: RunPageStudioTransaction) {
  return run(async (db) => {
    const proof = await operatorProof(db, request.operator)
    const rows = request.action === 'operator-status'
      ? [await readRequest(db, request.siteId, request.requestId)]
      : (await db.query<TransferRequestRow>(`SELECT * FROM page_studio_transfer_requests WHERE ($1::uuid IS NULL OR request_id>$1)
          ORDER BY request_id LIMIT 51`, [request.cursor ?? null])).rows
    const requests = []
    for (const row of rows.slice(0, 50)) {
      const matches = !row.operator_id || (row.operator_id === request.operator.actorId && row.operator_login_session_hash === request.operator.loginSessionHash)
      requests.push(projection(row, 'operator', matches, await validOriginal(row, db)))
    }
    if (!equal(proof, await operatorProof(db, request.operator))) throw denied()
    return request.action === 'operator-status' ? requests[0]! : { requests, nextCursor: rows.length > 50 ? rows[49]!.request_id : null }
  })
}
async function review(request: Extract<TransferControlsRequest, { action: 'review' }>, run: RunPageStudioTransaction) {
  const saved = await snapshot(request.siteId, request.requestId, run)
  return withRequestAuthority(saved, request.operator, async (db, row, authority) => {
    assertRevision(row, request.expectedRevision)
    if (!['requested', 'reviewed'].includes(row.state)) throw conflict()
    const reviewed = await reviewManagedTransferSource(authorityInput(row, request.operator), { runTransaction: work => work(db) })
    const { sourceDigest, ...summary } = reviewed
    const updated = await cas(db, row, `state='reviewed',operator_id=$3,operator_login_session_hash=$4,operator_proof=$5::jsonb,
      transfer_authority=$6::jsonb,source_digest=$7,review=$8::jsonb,review_revision=revision+1,
      expires_at=LEAST(expires_at,$9::timestamptz),approved_revision=NULL,approved_at=NULL`, [request.operator.actorId,
      request.operator.loginSessionHash, JSON.stringify(await operatorProof(db, request.operator)), JSON.stringify(authority),
      sourceDigest, JSON.stringify(summary), authority.expiresAt])
    return projection(updated, 'operator', true, true)
  }, run, Boolean(saved.operator_id))
}
async function approve(request: Extract<TransferControlsRequest, { action: 'approve' }>, run: RunPageStudioTransaction) {
  const saved = await snapshot(request.siteId, request.requestId, run)
  if (saved.owner_login_session_hash !== request.ownerLoginSessionHash) throw denied()
  return withRequestAuthority(saved, op(saved), async (db, row) => {
    if (row.owner_login_session_hash !== request.ownerLoginSessionHash) throw denied()
    assertRevision(row, request.expectedRevision)
    if (row.state !== 'reviewed' || row.review_revision !== request.expectedRevision) throw conflict()
    const reviewed = await reviewManagedTransferSource(authorityInput(row), { runTransaction: work => work(db) })
    const { sourceDigest, ...summary } = reviewed
    if (sourceDigest !== row.source_digest || !equal(summary, row.review)) throw conflict()
    return projection(await cas(db, row, 'state=\'approved\',approved_revision=revision+1,approved_at=clock_timestamp()', []), 'owner', true, true)
  }, run)
}
async function revoke(request: Extract<TransferControlsRequest, { action: 'revoke' }>, run: RunPageStudioTransaction) {
  return withOwnerMetadata(request.siteId, request.ownerLoginSessionHash, async (db, authority) => {
    const row = await readRequest(db, request.siteId, request.requestId, true)
    assertOwnerIdentity(row, authority)
    if (row.owner_login_session_hash !== request.ownerLoginSessionHash) throw denied()
    assertRevision(row, request.expectedRevision)
    if (!['requested', 'reviewed', 'approved'].includes(row.state)) throw conflict()
    return projection(await cas(db, row, 'state=\'revoked\',revoked_at=clock_timestamp()', []), 'owner', true, false)
  }, run)
}
/** Resolve the immutable intent by saved operation identity BEFORE source capture.
 * A successful reservation survives both a lost reply and a later source edit.
 * This recovers metadata only, never grants permission to advance a phase. */
async function recoverIntent(db: PageStudioQueryClient, row: TransferRequestRow) {
  const saved = (await db.query<{ operation_id: string, intent_digest: string, request: unknown }>(`
    SELECT operation_id,intent_digest,request FROM page_studio_managed_transfer_intents WHERE site_id=$1 OR operation_id=$2`,
  [row.site_id, row.operation_id])).rows
  if (!saved.length) return null
  if (saved.length !== 1 || saved[0]!.operation_id !== row.operation_id || !equal(saved[0]!.request, {
    operationId: row.operation_id, authority: authorityInput(row), expectedSourceDigest: row.source_digest
  })) throw conflict()
  const reference = { operationId: row.operation_id, intentDigest: saved[0]!.intent_digest }
  await withManagedTransferIntentAuthority(reference, async (_db, intent) => {
    if (!equal(intent.authority, row.transfer_authority) || intent.sourceDigest !== row.source_digest) throw conflict()
  }, { runTransaction: work => work(db) })
  return reference
}
async function reserve(request: Extract<TransferControlsRequest, { action: 'reserve' }>, run: RunPageStudioTransaction) {
  const saved = await snapshot(request.siteId, request.requestId, run)
  // Durable claim in its own transaction, before any uncertain reservation call.
  const claimed = await withRequestAuthority(saved, request.operator, async (db, row) => {
    if (row.state === 'reserved') {
      if (![row.revision, row.approved_revision, (row.approved_revision ?? 0) + 1].includes(request.expectedRevision)) throw conflict()
      const reference = await recoverIntent(db, row)
      if (!reference || reference.intentDigest !== row.intent_digest) throw conflict()
      return row
    }
    assertRevision(row, request.expectedRevision)
    if (row.state === 'reserving') return row
    if (row.state !== 'approved' || row.approved_revision !== request.expectedRevision) throw conflict()
    const reviewed = await reviewManagedTransferSource(authorityInput(row), { runTransaction: work => work(db) })
    if (reviewed.sourceDigest !== row.source_digest) throw conflict()
    return cas(db, row, 'state=\'reserving\'', [])
  }, run)
  if (claimed.state === 'reserved') return projection(claimed, 'operator', true, true)
  return withRequestAuthority(claimed, request.operator, async (db, row) => {
    if (row.state !== 'reserving' || row.operation_id !== claimed.operation_id) throw conflict()
    let reference = await recoverIntent(db, row)
    if (!reference) {
      const reserved = await reserveManagedTransferIntent({ operationId: row.operation_id, authority: authorityInput(row),
        expectedSourceDigest: row.source_digest }, { runTransaction: work => work(db) })
      reference = { operationId: reserved.operationId, intentDigest: reserved.intentDigest }
    }
    return projection(await cas(db, row, 'state=\'reserved\',intent_digest=$3', [reference.intentDigest]), 'operator', true, true)
  }, run)
}
/** Private service engine: SQL only; no HTTP authority or provider calls. */
export async function executeTransferControls(raw: unknown, dependencies: Dependencies) {
  const parsed = TransferControlsRequestSchema.safeParse(raw)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid transfer control request.' })
  const request = structuredClone(parsed.data), run = dependencies.runTransaction
  try {
    switch (request.action) {
      case 'request': return await createRequest(request, run)
      case 'owner-status': return await ownerStatus(request, run)
      case 'operator-status': case 'operator-list': return await operatorStatus(request, run)
      case 'review': return await review(request, run)
      case 'approve': return await approve(request, run)
      case 'revoke': return await revoke(request, run)
      case 'reserve': return await reserve(request, run)
    }
  } catch (error) {
    if (['55P03', '40P01', '57014'].includes(String((error as { code?: string })?.code))) {
      throw createError({ statusCode: 503, statusMessage: 'Transfer access is changing. Refresh its saved status.' })
    }
    if ((error as { code?: string })?.code === '23505') throw conflict()
    throw error
  }
}
const rejected = (requestDigest: string, statusCode = 503) => ({ ok: false as const, requestDigest,
  error: { statusCode, message: 'Transfer controls are unavailable. Refresh the saved status before continuing.' } })
export async function handleTransferControls(raw: unknown, env: Record<string, unknown>, run: Runner) {
  const parsed = TransferControlsRequestSchema.safeParse(raw)
  if (!parsed.success) return rejected('0'.repeat(64), 400)
  const request = structuredClone(parsed.data)
  const enabled = env.PAGE_STUDIO_RELEASE_ENVIRONMENT === 'production' && env.PAGE_STUDIO_PROVISIONING_ENVIRONMENT === 'production'
  const requestDigest = await collectionDigest(request)
  if (!enabled) return rejected(requestDigest)
  try {
    const value = await runCmsDatabaseInvocation(run, () => executeTransferControls(request, { runTransaction: transactionWithoutRetry }))
    return { ok: true as const, requestDigest, value: TransferControlsValueSchema.parse(value) }
  } catch (error) {
    const code = (error as { statusCode?: number })?.statusCode
    return rejected(requestDigest, code && [400, 401, 403, 409, 413].includes(code) ? code : 503)
  }
}

const ReservedControlInput = z.object({ siteId: z.string().uuid(), requestId: z.string().uuid(), expectedRevision: z.number().int().positive(),
  operator: z.object({ actorId: z.string().uuid(), loginSessionHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict() }).strict()
/** Internal phase bridge. Provider work stays OUTSIDE SQL locks. The actual phase
 * engine independently checks full retained intent/source authority around its
 * effects. This wrapper binds the current HTTP operator to the immutable request
 * before and after the one explicit phase call. Never return its reference publicly. */
export async function withReservedTransferControl<T>(raw: unknown,
  work: (reference: { operationId: string, intentDigest: string }) => Promise<T>, dependencies: Dependencies): Promise<T> {
  const parsed = ReservedControlInput.safeParse(raw)
  if (!parsed.success) throw denied()
  const input = structuredClone(parsed.data), run = dependencies.runTransaction
  const inspect = async () => {
    const saved = await snapshot(input.siteId, input.requestId, run)
    return withRequestAuthority(saved, input.operator, async (db, row) => {
      assertOperator(row, input.operator)
      assertRevision(row, input.expectedRevision)
      if (row.state !== 'reserved') throw conflict()
      const reference = await recoverIntent(db, row)
      if (!reference || reference.intentDigest !== row.intent_digest) throw conflict()
      return reference
    }, run)
  }
  const reference = await inspect()
  const value = await work(structuredClone(reference))
  if (!equal(reference, await inspect())) throw conflict()
  return value
}
