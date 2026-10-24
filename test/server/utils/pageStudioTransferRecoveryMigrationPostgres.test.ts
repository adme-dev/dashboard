import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { describe, expect, it } from 'vitest'

const databaseUrl = process.env.PAGE_STUDIO_CMS_DATABASE_TEST_URL
if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || !/^\/studio_cms_[a-z0-9_]+$/.test(url.pathname) || url.search) throw new Error('Disposable localhost studio_cms database required')
}

describe.runIf(Boolean(databaseUrl))('recovery head migration on disposable PostgreSQL', () => {
  it('cannot reuse another operation historical recovery ID or forge immutable transition history', async () => {
    const schema = `recovery_${randomUUID().replaceAll('-', '')}`
    const db = new pg.Client({ connectionString: databaseUrl })
    await db.connect()
    try {
      await db.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}",pg_catalog`)
      // Minimal referenced rows isolate migration invariants; admission tests use
      // the real original intent, owner, plan, sessions and authority boundary.
      await db.query(`CREATE TABLE page_studio_sites(id UUID PRIMARY KEY);
        CREATE TABLE page_studio_managed_transfer_intents(operation_id UUID PRIMARY KEY,site_id UUID NOT NULL,intent_digest TEXT NOT NULL)`)
      const migration = readFileSync('server/database/migrations/473_page_studio_transfer_recovery_heads.sql', 'utf8')
      await db.query(migration)
      const operation = randomUUID(), otherOperation = randomUUID(), site = randomUUID(), otherSite = randomUUID()
      const recovery = randomUUID(), successor = randomUUID(), digest = 'a'.repeat(64)
      await db.query('INSERT INTO page_studio_sites VALUES($1),($2)', [site, otherSite])
      await db.query('INSERT INTO page_studio_managed_transfer_intents VALUES($1,$2,$3),($4,$5,$3)', [operation, site, digest, otherOperation, otherSite])
      const insert = (op: string, id: string) => db.query(`INSERT INTO page_studio_transfer_recovery_heads
        (operation_id,intent_digest,recovery_id,epoch,mode,cas_version,deadline)
        VALUES($1,$2,$3,1,'reconciling',1,clock_timestamp()+interval '1 hour')`, [op, digest, id])
      await insert(operation, recovery)
      await db.query("UPDATE page_studio_transfer_recovery_heads SET mode='revoked',cas_version=2 WHERE operation_id=$1", [operation])
      await db.query(`UPDATE page_studio_transfer_recovery_heads SET mode='reconciling',cas_version=3,epoch=2,recovery_id=$2
        WHERE operation_id=$1 AND recovery_id=$3 AND cas_version=2 AND mode='revoked'`, [operation, successor, recovery])
      await expect(insert(otherOperation, recovery)).rejects.toThrow('Recovery identity cannot be reused')
      await expect(db.query('INSERT INTO page_studio_transfer_recovery_events SELECT operation_id,4,recovery_id,epoch,mode,intent_digest,deadline,clock_timestamp() FROM page_studio_transfer_recovery_heads')).rejects.toThrow('Recovery history is immutable')
      const history = (await db.query('SELECT * FROM page_studio_transfer_recovery_events ORDER BY cas_version')).rows
      expect(history.map(row => [row.cas_version, row.epoch, row.mode])).toEqual([[1, 1, 'reconciling'], [2, 1, 'revoked'], [3, 2, 'reconciling']])
      // Reapplying additive DDL preserves actual original rows and history.
      await db.query(migration)
      expect((await db.query('SELECT * FROM page_studio_transfer_recovery_events ORDER BY cas_version')).rows).toEqual(history)
    } finally {
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await db.end()
    }
  })
})
