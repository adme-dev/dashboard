// Genuine owner/operator PG lifecycle; retained progress is synthetic test data,
// so this proves relational consent gating, not native physical acceptance.
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { continuationDatabaseUrl, continuationLifecycle } from '../../support/continuationLifecycle'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { appendContinuationJournal } from '~~/server/utils/pageStudio/continuationJournal'
import { continuationConsentDigest } from '~~/shared/pageStudio/transferRecoveryContinuationReview'
import { recoveryContinuationCurrentContext } from '~~/server/utils/pageStudio/customerTransferRecoveryContinuationAuthority'

const planned = JSON.parse(readFileSync('test/fixtures/transfer-recovery-continuation-journal-planned.json', 'utf8'))
describe.runIf(Boolean(continuationDatabaseUrl))('continuation journal fresh consent guard', { timeout: 30000 }, () => {
  const lifecycle = continuationLifecycle()
  async function setup() {
    const f = await lifecycle.freezeFixture(), pair = await f.prepare()
    for (const name of ['480_page_studio_transfer_recovery_continuations.sql', '481_page_studio_transfer_continuation_consents.sql']) {
      await lifecycle.db.query(readFileSync(`server/database/migrations/${name}`, 'utf8'))
      await lifecycle.db.query(readFileSync(`server/database/migrations/${name}`, 'utf8'))
    }
    const context = await lifecycle.runTransaction(db => recoveryContinuationCurrentContext(db, f.route,
      { operator: lifecycle.input.operator }, { renewalRequestId: f.create.body.renewalRequestId, expectedOriginalHeadDigest: pair.association.enabledHeadDigest }))
    const progress = { ...structuredClone(planned.initialProgress), operationId: context.intent.operationId, intentDigest: context.evidence.authority.intentDigest,
      originalRecoveryHeadDigest: pair.association.enabledHeadDigest }
    const revision = Number((await lifecycle.db.query('SELECT max(revision) AS revision FROM page_studio_transfer_recovery_reviews')).rows[0].revision) + 1
    const review = { formatVersion: 2, kind: 'managed-transfer-continuation-review-v2', reviewId: randomUUID(), revision,
      continuationId: randomUUID(), issuedAt: new Date(Date.now() - 1000).toISOString(), maximumDeadline: new Date(Date.now() + 300000).toISOString(),
      predecessor: { grantDigest: null, originalRecoveryHeadDigest: pair.association.enabledHeadDigest, journal: null },
      evidence: context.evidence, authorityDigest: context.authorityDigest, progress, progressDigest: await collectionDigest(progress), descriptorDigest: 'a'.repeat(64),
      remainingWork: 'same-operation-source-through-retention' }
    const reviewDigest = await collectionDigest(review)
    const insertReview = (value = review, digest = reviewDigest, db = lifecycle.db) => db.query(`INSERT INTO page_studio_transfer_recovery_reviews
      (review_id,operation_id,recovery_id,revision,review_digest,review,request,operator_login_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [value.reviewId, context.intent.operationId, context.evidence.authority.recoveryId,
      value.revision, digest, value, { reviewId: value.reviewId }, lifecycle.input.operator.loginSessionHash])
    const consent = async (party: 'owner' | 'operator', expiresAt = review.maximumDeadline) => {
      const actor = party === 'owner' ? context.evidence.principals.identityId : context.evidence.principals.operatorId
      const hash = party === 'owner' ? lifecycle.input.ownerLoginSessionHash : lifecycle.input.operator.loginSessionHash
      const result = await lifecycle.db.query(`INSERT INTO page_studio_transfer_recovery_consents
        (consent_id,review_id,revision,review_digest,party,actor_id,login_hash,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING consent_id,review_id,revision,review_digest,party,actor_id,login_hash,
        to_char(issued_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS issued_at,
        to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS expires_at`,
      [randomUUID(), review.reviewId, review.revision, reviewDigest, party, actor, hash, expiresAt])
      return continuationConsentDigest(result.rows[0])
    }
    const grant = { formatVersion: 1, kind: 'managed-transfer-continuation-v1', operationId: context.intent.operationId,
      intentDigest: context.evidence.authority.intentDigest, continuationId: review.continuationId, predecessor: review.predecessor,
      reviewDigest, ownerConsentDigest: 'b'.repeat(64), operatorConsentDigest: 'c'.repeat(64), authorityDigest: review.authorityDigest,
      descriptorDigest: review.descriptorDigest, progressDigest: review.progressDigest, allowedThrough: 'source-retention',
      issuedAt: new Date().toISOString(), deadline: review.maximumDeadline }
    const insertGrant = async (body = grant) => {
      const entry = { operationId: grant.operationId, sequence: 1, entryId: randomUUID(), previousDigest: null, kind: 'grant', body }
      const digest = await collectionDigest(entry)
      return lifecycle.runTransaction(db => appendContinuationJournal(db, null, { ...entry, digest }))
    }
    return { context, review, reviewDigest, insertReview, consent, grant, insertGrant }
  }
  it('requires two fresh exact consents and rejects mismatched digest or changed review before storing one grant', async () => {
    const x = await setup()
    await x.insertReview()
    await expect(x.insertGrant()).rejects.toThrow(/consent/i)
    x.grant.ownerConsentDigest = await x.consent('owner')
    await expect(x.insertGrant()).rejects.toThrow(/consent/i)
    x.grant.operatorConsentDigest = await x.consent('operator')
    await expect(x.insertGrant({ ...x.grant, ownerConsentDigest: 'f'.repeat(64) })).rejects.toThrow(/consent/i)
    await expect(x.insertGrant({ ...x.grant, progressDigest: 'f'.repeat(64) })).rejects.toThrow(/review/i)
    x.grant.issuedAt = new Date().toISOString()
    await x.insertGrant()
    expect((await lifecycle.db.query('SELECT count(*) FROM page_studio_transfer_recovery_continuations')).rows[0].count).toBe('1')
  })
  it('rejects stale review revision, foreign original head and legacy approval reuse', async () => {
    const x = await setup()
    await expect(x.insertReview({ ...x.review, revision: x.review.revision + 1 })).rejects.toThrow(/revision/i)
    await expect(x.insertReview({ ...x.review, predecessor: { ...x.review.predecessor, originalRecoveryHeadDigest: 'f'.repeat(64) } })).rejects.toThrow(/lineage/i)
    await x.insertReview()
    const capture = (await lifecycle.db.query('SELECT capture_id FROM page_studio_transfer_recovery_reconciliations LIMIT 1')).rows[0].capture_id
    const id = randomUUID()
    await expect(lifecycle.db.query(`INSERT INTO page_studio_transfer_recovery_approvals
      (approval_id,review_id,fresh_capture_id,approval,approval_digest) VALUES($1,$2,$3,$4,$5)`,
    [id, x.review.reviewId, capture, { approvalId: id, reviewId: x.review.reviewId, freshCapture: { captureId: capture } }, 'a'.repeat(64)])).rejects.toThrow(/continuation/i)
  })
  it('rejects sub-millisecond consent expiry and a deadline beyond either fresh consent', async () => {
    const x = await setup()
    await x.insertReview()
    await expect(x.consent('owner', x.review.maximumDeadline.replace('Z', '001Z'))).rejects.toThrow(/consent/)
    const short = new Date(Date.now() + 300).toISOString()
    x.grant.ownerConsentDigest = await x.consent('owner', short)
    x.grant.operatorConsentDigest = await x.consent('operator')
    x.grant.issuedAt = new Date().toISOString()
    await expect(x.insertGrant()).rejects.toThrow(/consent/)
    await lifecycle.db.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM $1::timestamptz-clock_timestamp())+0.02))', [short])
    await expect(x.insertGrant()).rejects.toThrow(/consent/)
  })

  it('serializes a new review against consent and rejects superseded consent and grant', async () => {
    const x = await setup()
    await x.insertReview()
    x.grant.ownerConsentDigest = await x.consent('owner')
    x.grant.operatorConsentDigest = await x.consent('operator')
    const next = { ...x.review, reviewId: randomUUID(), revision: x.review.revision + 1, continuationId: randomUUID() }
    await lifecycle.runTransaction(async (db) => {
      await x.insertReview(next, await collectionDigest(next), db)
      await expect(x.consent('owner')).rejects.toMatchObject({ code: '55P03' })
    })
    await expect(x.consent('owner')).rejects.toThrow(/consent/)
    x.grant.issuedAt = new Date().toISOString()
    await expect(x.insertGrant()).rejects.toThrow(/review/)
  })
})
