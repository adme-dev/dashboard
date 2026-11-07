// Real PostgreSQL persistence/CAS tests. Native transition semantics and current
// customer authority are separate boundaries; these minimal heads are not receipts.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { planContinuationAdmissionEvidence, observeContinuationAdmissionEvidence, readContinuationAdmissionEvidence } from '~~/server/utils/pageStudio/continuationAdmissionEvidence'

const url = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (url) {
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' || !/^\/studio_cms_[a-z0-9_]+$/.test(parsed.pathname) || parsed.search) throw new Error('Disposable localhost database required')
}
const fixture = JSON.parse(readFileSync('test/fixtures/transfer-recovery-continuation-journal-planned.json', 'utf8'))
describe.runIf(Boolean(url))('durable continuation admission evidence', () => {
  const schema = `admission_evidence_${randomUUID().replaceAll('-', '')}`
  const db = new pg.Client({ connectionString: url })
  beforeAll(async () => {
    await db.connect()
    await db.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}",pg_catalog;
      CREATE TABLE page_studio_sites(id UUID PRIMARY KEY);
      CREATE TABLE page_studio_managed_transfer_intents(operation_id UUID PRIMARY KEY,site_id UUID NOT NULL,intent_digest TEXT NOT NULL);`)
    await db.query(readFileSync('server/database/migrations/480_page_studio_transfer_recovery_continuations.sql', 'utf8'))
    const migration = readFileSync('server/database/migrations/482_page_studio_continuation_admission_evidence.sql', 'utf8')
    await db.query(migration)
    await db.query(migration)
  })
  afterAll(async () => {
    await db.query('ROLLBACK')
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await db.end()
  })
  async function setup(lifetime = 600000) {
    const operationId = randomUUID(), siteId = randomUUID()
    const grant = { ...structuredClone(fixture.grant), operationId, continuationId: randomUUID(),
      issuedAt: new Date(Date.now() - 1000).toISOString(), deadline: new Date(Date.now() + lifetime).toISOString() }
    const payload = { operationId, sequence: 1, entryId: randomUUID(), kind: 'grant', previousDigest: null, body: grant }
    const cursor = { sequence: 1, digest: await collectionDigest(payload) }
    await db.query('INSERT INTO page_studio_sites VALUES($1)', [siteId])
    await db.query('INSERT INTO page_studio_managed_transfer_intents VALUES($1,$2,$3)', [operationId, siteId, grant.intentDigest])
    await db.query(`INSERT INTO page_studio_transfer_recovery_continuations
      (operation_id,sequence,entry_id,kind,previous_digest,body,body_json,digest) VALUES($1,1,$2,'grant',NULL,$3,$4,$5)`,
    [operationId, payload.entryId, grant, collectionCanonical(grant), cursor.digest])
    const previous = { operationId, intentDigest: grant.intentDigest, version: 3, mode: 'enabled' }
    const request = { action: 'prepare', eventId: randomUUID(), formatVersion: 1, purpose: 'recovery-continuation-admission',
      appliedDigest: null, baseline: structuredClone(fixture.initialProgress), grant, expectedVersion: 3, previousHeadDigest: await collectionDigest(previous) }
    const result = { operationId, intentDigest: grant.intentDigest, version: 4, mode: 'prepared', grantDigest: await collectionDigest(grant), preparedDigest: await collectionDigest(request) }
    return { operationId, cursor, previous, request, result }
  }
  async function advance(f: Awaited<ReturnType<typeof setup>>, step: string) {
    const last = (await db.query('SELECT sequence,digest FROM page_studio_transfer_recovery_continuations WHERE operation_id=$1 ORDER BY sequence DESC LIMIT 1', [f.operationId])).rows[0]
    const body = { continuationId: f.request.grant.continuationId, grantDigest: await collectionDigest(f.request.grant), step, receiptDigest: 'd'.repeat(64) }
    const payload = { operationId: f.operationId, sequence: last.sequence + 1, entryId: randomUUID(), kind: 'admission', previousDigest: last.digest, body }
    const digest = await collectionDigest(payload)
    await db.query(`INSERT INTO page_studio_transfer_recovery_continuations
      (operation_id,sequence,entry_id,kind,previous_digest,body,body_json,digest) VALUES($1,$2,$3,'admission',$4,$5,$6,$7)`,
    [f.operationId, payload.sequence, payload.entryId, payload.previousDigest, body, collectionCanonical(body), digest])
    return { sequence: payload.sequence, digest }
  }
  it('retains exact planned bytes before dispatch and reconstructs request, predecessor and result after reconnect', async () => {
    const f = await setup()
    const planned = await planContinuationAdmissionEvidence(db, f)
    expect((await readContinuationAdmissionEvidence(db, f.operationId, f.request.eventId))?.observed).toBeNull()
    const observed = await observeContinuationAdmissionEvidence(db, { operationId: f.operationId, eventId: f.request.eventId, result: f.result })
    const second = new pg.Client({ connectionString: url })
    await second.connect()
    try {
      await second.query(`SET search_path TO "${schema}",pg_catalog`)
      const retained = await readContinuationAdmissionEvidence(second, f.operationId, f.request.eventId)
      expect(retained).toEqual({ planned, observed })
      expect(retained?.planned.payload).toEqual({ request: f.request, previous: f.previous })
      expect(retained?.observed?.payload).toEqual({ result: f.result })
      expect(await planContinuationAdmissionEvidence(second, f)).toEqual(planned)
      expect(await observeContinuationAdmissionEvidence(second, { operationId: f.operationId, eventId: f.request.eventId, result: f.result })).toEqual(observed)
    } finally { await second.end() }
  })
  it('rejects replacement events, altered retries, orphan observations and mutable history', async () => {
    const f = await setup()
    await expect(observeContinuationAdmissionEvidence(db, { operationId: f.operationId, eventId: f.request.eventId, result: f.result })).rejects.toThrow()
    await planContinuationAdmissionEvidence(db, f)
    const changed = structuredClone(f)
    changed.request.eventId = randomUUID()
    await expect(planContinuationAdmissionEvidence(db, changed)).rejects.toThrow()
    changed.request.eventId = f.request.eventId
    changed.request.baseline = { ...changed.request.baseline, arbitrary: 'changed' }
    await expect(planContinuationAdmissionEvidence(db, changed)).rejects.toThrow()
    await observeContinuationAdmissionEvidence(db, { operationId: f.operationId, eventId: f.request.eventId, result: f.result })
    await expect(observeContinuationAdmissionEvidence(db, { operationId: f.operationId, eventId: f.request.eventId, result: { ...f.result, preparedDigest: 'f'.repeat(64) } })).rejects.toThrow()
    await expect(db.query('UPDATE page_studio_continuation_admission_evidence SET action=action')).rejects.toThrow(/immutable/)
    await expect(db.query('DELETE FROM page_studio_continuation_admission_evidence')).rejects.toThrow(/immutable/)
  })
  it('serializes competing planners and rejects stale cursor and foreign operation evidence', async () => {
    const f = await setup(), first = new pg.Client({ connectionString: url }), second = new pg.Client({ connectionString: url })
    await first.connect()
    await second.connect()
    try {
      for (const client of [first, second]) await client.query(`BEGIN; SET LOCAL search_path TO "${schema}",pg_catalog; SET LOCAL statement_timeout='2s'`)
      await planContinuationAdmissionEvidence(first, f)
      await expect(planContinuationAdmissionEvidence(second, f)).rejects.toMatchObject({ code: '55P03' })
      await second.query('ROLLBACK')
      await first.query('COMMIT')
      await expect(planContinuationAdmissionEvidence(db, { ...f, cursor: { ...f.cursor, digest: 'f'.repeat(64) } })).rejects.toThrow()
      expect(await readContinuationAdmissionEvidence(db, randomUUID(), f.request.eventId)).toBeNull()
      await expect(observeContinuationAdmissionEvidence(db, { operationId: randomUUID(), eventId: f.request.eventId, result: f.result })).rejects.toThrow()
    } finally {
      await first.query('ROLLBACK')
      await second.query('ROLLBACK')
      await first.end()
      await second.end()
    }
  })
  it('rejects corrupt readback and oversized native evidence without inserting partial records', async () => {
    const f = await setup()
    const large = structuredClone(f)
    large.previous = { ...large.previous, extra: 'x'.repeat(65536) } as typeof large.previous
    large.request.previousHeadDigest = await collectionDigest(large.previous)
    await expect(planContinuationAdmissionEvidence(db, large)).rejects.toThrow(/size/)
    expect(await readContinuationAdmissionEvidence(db, f.operationId, f.request.eventId)).toBeNull()
    await planContinuationAdmissionEvidence(db, f)
    const corrupt = new Proxy(db, { get(target, property) {
      if (property !== 'query') return Reflect.get(target, property)
      return async (sql: string, values?: unknown[]) => {
        const result = await db.query(sql, values)
        return sql.includes('FROM page_studio_continuation_admission_evidence')
          ? { ...result, rows: result.rows.map(row => ({ ...row, payload_json: `${row.payload_json} ` })) }
          : result
      }
    } })
    await expect(readContinuationAdmissionEvidence(corrupt, f.operationId, f.request.eventId)).rejects.toThrow()
  })
  it('permits enable only from the applied journal cursor and retains a distinct revoke event', async () => {
    const f = await setup()
    await planContinuationAdmissionEvidence(db, f)
    await observeContinuationAdmissionEvidence(db, { operationId: f.operationId, eventId: f.request.eventId, result: f.result })
    const previous = f.result
    const request = { ...f.request, action: 'enable', eventId: randomUUID(), expectedVersion: 4,
      previousHeadDigest: await collectionDigest(previous), appliedDigest: 'e'.repeat(64) }
    await expect(planContinuationAdmissionEvidence(db, { cursor: f.cursor, request, previous })).rejects.toThrow()
    const preparedCursor = await advance(f, 'prepared')
    await expect(planContinuationAdmissionEvidence(db, { cursor: preparedCursor, request, previous })).rejects.toThrow()
    const cursor = await advance(f, 'applied')
    await planContinuationAdmissionEvidence(db, { cursor, request, previous })
    const result = { ...previous, version: 5, mode: 'enabled', appliedDigest: request.appliedDigest }
    await observeContinuationAdmissionEvidence(db, { operationId: f.operationId, eventId: request.eventId, result })
    const enabledCursor = await advance(f, 'enabled')
    const revoke = { ...request, action: 'revoke', eventId: randomUUID(), expectedVersion: 5, previousHeadDigest: await collectionDigest(result) }
    await planContinuationAdmissionEvidence(db, { cursor: enabledCursor, request: revoke, previous: result })
    await observeContinuationAdmissionEvidence(db, { operationId: f.operationId, eventId: revoke.eventId, result: { ...result, version: 6, mode: 'revoked' } })
    expect((await db.query('SELECT count(*)::int AS n FROM page_studio_continuation_admission_evidence WHERE operation_id=$1', [f.operationId])).rows[0].n).toBe(6)
    const fresh = await setup()
    await advance(fresh, 'prepared')
    await expect(planContinuationAdmissionEvidence(db, fresh)).rejects.toThrow(/cursor/)
  })
  it('retains late observations after grant expiry without authorizing a new native request', async () => {
    const f = await setup(1000), expired = await setup(1000)
    await planContinuationAdmissionEvidence(db, f)
    await db.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM $1::timestamptz-clock_timestamp())+0.03))', [expired.request.grant.deadline])
    await observeContinuationAdmissionEvidence(db, { operationId: f.operationId, eventId: f.request.eventId, result: f.result })
    expect((await readContinuationAdmissionEvidence(db, f.operationId, f.request.eventId))?.observed?.payload).toEqual({ result: f.result })
    await expect(planContinuationAdmissionEvidence(db, expired)).rejects.toThrow(/grant/)
  })
})
