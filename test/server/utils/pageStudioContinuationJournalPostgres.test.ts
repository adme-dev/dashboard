// Real PostgreSQL structural/CAS tests. Minimal parent rows do not prove live authority.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { collectionCanonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'

const url = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (url) {
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' || !/^\/studio_cms_[a-z0-9_]+$/.test(parsed.pathname) || parsed.search) throw new Error('Disposable localhost database required')
}
const fixture = JSON.parse(readFileSync('test/fixtures/transfer-recovery-continuation-journal-planned.json', 'utf8'))
describe.runIf(Boolean(url))('continuation journal PostgreSQL structure', () => {
  const schema = `journal_${randomUUID().replaceAll('-', '')}`
  const db = new pg.Client({ connectionString: url })
  const siteId = randomUUID()
  beforeAll(async () => {
    await db.connect()
    await db.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}",pg_catalog`)
    await db.query(`CREATE TABLE page_studio_sites(id UUID PRIMARY KEY);
      CREATE TABLE page_studio_managed_transfer_intents(operation_id UUID PRIMARY KEY,site_id UUID NOT NULL,intent_digest TEXT NOT NULL);`)
    await db.query('INSERT INTO page_studio_sites VALUES($1)', [siteId])
    await db.query('INSERT INTO page_studio_managed_transfer_intents VALUES($1,$2,$3)', [fixture.grant.operationId, siteId, fixture.grant.intentDigest])
    await db.query(readFileSync('server/database/migrations/480_page_studio_transfer_recovery_continuations.sql', 'utf8'))
  })
  afterAll(async () => {
    await db.query('ROLLBACK')
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await db.end()
  })
  async function insert(entry: typeof fixture.journal[number], client = db) {
    return client.query(`INSERT INTO page_studio_transfer_recovery_continuations
      (operation_id,sequence,entry_id,kind,previous_digest,body,body_json,digest)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING digest`,
    [entry.operationId, entry.sequence, entry.entryId, entry.kind, entry.previousDigest, JSON.stringify(entry.body), collectionCanonical(entry.body), entry.digest])
  }
  async function nextEntry(template: typeof fixture.journal[number]) {
    const rows = (await db.query('SELECT sequence,digest,kind,body FROM page_studio_transfer_recovery_continuations ORDER BY sequence')).rows
    const last = rows.at(-1)!
    const entry = { ...structuredClone(template), entryId: randomUUID(), sequence: last.sequence + 1, previousDigest: last.digest }
    entry.body.grantDigest = await collectionDigest(rows.find(r => r.kind === 'grant')!.body)
    const { digest: _digest, ...payload } = entry
    entry.digest = await collectionDigest(payload)
    return entry
  }
  it('stores canonical chain bytes and rejects rewrites, skipped sequences and forged digests', async () => {
    // Clock-relative grant avoids accidentally treating the historical fixture as current authority.
    const grant = structuredClone(fixture.journal[0])
    grant.body.issuedAt = new Date(Date.now() - 1000).toISOString()
    grant.body.deadline = new Date(Date.now() + 600000).toISOString()
    const { digest: _digest, ...payload } = grant
    grant.digest = await collectionDigest(payload)
    expect((await insert(grant)).rows[0].digest).toBe(grant.digest)
    const stored = (await db.query('SELECT body_json FROM page_studio_transfer_recovery_continuations')).rows[0]
    expect(stored.body_json).toBe(collectionCanonical(grant.body))
    await expect(db.query('UPDATE page_studio_transfer_recovery_continuations SET kind=\'revocation\'')).rejects.toThrow()
    await expect(db.query('DELETE FROM page_studio_transfer_recovery_continuations')).rejects.toThrow()
    const next = structuredClone(fixture.journal[1])
    next.previousDigest = grant.digest
    next.body.grantDigest = await collectionDigest(grant.body)
    next.digest = await collectionDigest(Object.fromEntries(Object.entries(next).filter(([key]) => key !== 'digest')))
    await expect(insert({ ...next, sequence: 3 })).rejects.toThrow()
    await expect(insert({ ...next, digest: '0'.repeat(64) })).rejects.toThrow()
    await insert(next)
    await expect(insert(next)).rejects.toThrow()
  })

  it('serializes simultaneous writers on the original site and rejects a stale retry', async () => {
    const first = new pg.Client({ connectionString: url }), second = new pg.Client({ connectionString: url })
    await first.connect()
    await second.connect()
    const entry = await nextEntry(fixture.journal[2])
    try {
      for (const client of [first, second]) await client.query(`BEGIN; SET LOCAL search_path TO "${schema}",pg_catalog; SET LOCAL statement_timeout='2s'`)
      await insert(entry, first)
      await expect(insert(entry, second)).rejects.toMatchObject({ code: '55P03' })
      await second.query('ROLLBACK')
      await first.query('COMMIT')
      await expect(insert(entry)).rejects.toThrow()
    } finally {
      await first.query('ROLLBACK')
      await second.query('ROLLBACK')
      await first.end()
      await second.end()
    }
  })

  it('preserves exact phase provenance and closes execution after revocation', async () => {
    await insert(await nextEntry(fixture.journal[3]))
    const entry = await nextEntry(fixture.journal[4])
    const unknown = structuredClone(entry)
    unknown.body.allowRetry = true
    unknown.digest = await collectionDigest(Object.fromEntries(Object.entries(unknown).filter(([key]) => key !== 'digest')))
    await expect(insert(unknown)).rejects.toThrow(/shape/)
    await insert(entry)
    const duplicate = await nextEntry(fixture.journal[4])
    duplicate.body.beforeProgressDigest = entry.body.afterProgressDigest
    duplicate.digest = await collectionDigest(Object.fromEntries(Object.entries(duplicate).filter(([key]) => key !== 'digest')))
    await expect(insert(duplicate)).rejects.toThrow(/phase linkage/)
    const revocation = await nextEntry({ ...entry, kind: 'revocation', body: {
      continuationId: entry.body.continuationId, grantDigest: entry.body.grantDigest, reason: 'operator', authorityDigest: 'a'.repeat(64)
    } })
    await insert(revocation)
    await expect(insert(await nextEntry(fixture.journal[5]))).rejects.toThrow(/revoked/)
  })
  it('prevents the same continuation identity being admitted concurrently on different sites', async () => {
    const first = new pg.Client({ connectionString: url }), second = new pg.Client({ connectionString: url })
    await first.connect()
    await second.connect()
    const continuationId = randomUUID()
    const entries = []
    for (let i = 0; i < 2; i++) {
      const operationId = randomUUID(), otherSite = randomUUID()
      await db.query('INSERT INTO page_studio_sites VALUES($1)', [otherSite])
      await db.query('INSERT INTO page_studio_managed_transfer_intents VALUES($1,$2,$3)', [operationId, otherSite, fixture.grant.intentDigest])
      const entry = { ...structuredClone(fixture.journal[0]), operationId, entryId: randomUUID() }
      Object.assign(entry.body, { operationId, continuationId, issuedAt: new Date(Date.now() - 1000).toISOString(), deadline: new Date(Date.now() + 600000).toISOString() })
      const { digest: _digest, ...payload } = entry
      entry.digest = await collectionDigest(payload)
      entries.push(entry)
    }
    try {
      for (const client of [first, second]) await client.query(`BEGIN; SET LOCAL search_path TO "${schema}",pg_catalog; SET LOCAL statement_timeout='300ms'`)
      await insert(entries[0], first)
      await expect(insert(entries[1], second)).rejects.toMatchObject({ code: '57014' })
      await second.query('ROLLBACK')
      await first.query('COMMIT')
      await expect(insert(entries[1])).rejects.toMatchObject({ code: '23505' })
    } finally {
      await first.query('ROLLBACK')
      await second.query('ROLLBACK')
      await first.end()
      await second.end()
    }
  })
})
