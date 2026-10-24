import type pg from 'pg'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { continuationDatabaseUrl, continuationLifecycle } from '../../support/continuationLifecycle'
import { recoveryContinuationCurrentContext, finishRecoveryContinuationAuthority } from '~~/server/utils/pageStudio/customerTransferRecoveryContinuationAuthority'

describe.runIf(Boolean(continuationDatabaseUrl))('continuation current authority with real native PG lifecycle', { timeout: 30000 }, () => {
  const lifecycle = continuationLifecycle()
  async function fixture() {
    const f = await lifecycle.freezeFixture()
    const pair = await f.prepare()
    const options = { renewalRequestId: f.create.body.renewalRequestId, expectedOriginalHeadDigest: pair.association.enabledHeadDigest }
    const actor = { operator: lifecycle.input.operator }
    const context = () => lifecycle.runTransaction(db => recoveryContinuationCurrentContext(db, f.route, actor, options))
    return { f, pair, actor, options, context }
  }
  it('reads current native owner/operator/renewed plan after source-freeze preparation without early-phase absence checks', async () => {
    const x = await fixture(), value = await x.context()
    expect(value.evidence.authority.originalRecoveryHeadDigest).toBe(x.pair.association.enabledHeadDigest)
    expect(value.evidence.principals.identityId).toBe(lifecycle.expected.identityId)
    expect(value.evidence.plan.entitlementId).not.toBe(lifecycle.input.entitlementId)
    expect(value.selection.state).toBe('source')
    await lifecycle.runTransaction(async (db) => {
      const current = await recoveryContinuationCurrentContext(db, x.f.route, x.actor, x.options)
      expect(await finishRecoveryContinuationAuthority(db, current, new Date(Date.now() + 10000).toISOString(), {
        operator: lifecycle.input.operator.loginSessionHash, owner: lifecycle.input.ownerLoginSessionHash
      })).toMatch(/Z$/)
    })
  })
  it('allows a genuinely elapsed original head deadline without renewing it or weakening v1', async () => {
    lifecycle.setReviewLifetime(2000)
    const x = await fixture()
    const before = (await lifecycle.db.query('SELECT deadline FROM page_studio_transfer_recovery_heads')).rows[0].deadline
    await lifecycle.db.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM deadline-clock_timestamp())+0.03)) FROM page_studio_transfer_recovery_heads')
    const value = await x.context()
    expect(value.evidence.authority.originalRecoveryHeadDigest).toBe(x.pair.association.enabledHeadDigest)
    const { recoveryCurrentContext } = await import('~~/server/utils/pageStudio/customerTransferRecoveryCurrentAuthority')
    await expect(lifecycle.runTransaction(db => recoveryCurrentContext(db, x.f.route, x.actor, x.options.renewalRequestId, 'applied'))).rejects.toThrow()
    await lifecycle.runTransaction(async (db) => {
      const current = await recoveryContinuationCurrentContext(db, x.f.route, x.actor, x.options)
      await finishRecoveryContinuationAuthority(db, current, new Date(Date.now() + 10000).toISOString(), {
        operator: lifecycle.input.operator.loginSessionHash, owner: lifecycle.input.ownerLoginSessionHash
      })
    })
    expect((await lifecycle.db.query('SELECT deadline FROM page_studio_transfer_recovery_heads')).rows[0].deadline).toEqual(before)
  })
  it('rejects owner revocation, staff role loss and current plan replacement independently', async () => {
    const x = await fixture()
    for (const change of [
      (db: pg.Client) => db.query('UPDATE page_studio_customer_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [lifecycle.input.ownerLoginSessionHash]),
      (db: pg.Client) => db.query('UPDATE team_members SET is_active=FALSE WHERE id=$1', [lifecycle.input.operator.actorId]),
      (db: pg.Client) => db.query('UPDATE page_studio_sites SET entitlement_id=$1 WHERE id=$2', [lifecycle.input.entitlementId, lifecycle.input.siteId])
    ]) {
      await expect(lifecycle.runTransaction(async (db) => {
        const current = await recoveryContinuationCurrentContext(db, x.f.route, x.actor, x.options)
        await change(db)
        await finishRecoveryContinuationAuthority(db, current, new Date(Date.now() + 10000).toISOString(), {
          operator: lifecycle.input.operator.loginSessionHash, owner: lifecycle.input.ownerLoginSessionHash
        })
      })).rejects.toThrow()
    }
    await expect(x.context()).resolves.toBeDefined()
  })
  it('rejects foreign native head lineage and forged current sessions', async () => {
    const x = await fixture()
    await expect(lifecycle.runTransaction(db => recoveryContinuationCurrentContext(db, x.f.route, x.actor, { ...x.options, expectedOriginalHeadDigest: 'f'.repeat(64) }))).rejects.toThrow()
    await expect(lifecycle.runTransaction(db => recoveryContinuationCurrentContext(db, x.f.route, { operator: { actorId: randomUUID(), loginSessionHash: 'e'.repeat(64) } }, x.options))).rejects.toThrow()
    await expect(lifecycle.runTransaction(db => recoveryContinuationCurrentContext(db, x.f.route, { ownerHash: 'e'.repeat(64) }, x.options))).rejects.toThrow()
  })
  it('rejects expired current entitlement instead of treating historical renewal as authority', async () => {
    const x = await fixture()
    await lifecycle.db.query('UPDATE page_studio_entitlements SET effective_until=clock_timestamp()-interval \'1 second\' WHERE status=\'active\'')
    await expect(x.context()).rejects.toThrow()
  })
  it('checks the genuine login clock after awaited work before final permission', async () => {
    const x = await fixture()
    await lifecycle.runTransaction(async (db) => {
      const current = await recoveryContinuationCurrentContext(db, x.f.route, x.actor, x.options)
      await db.query('UPDATE page_studio_login_sessions SET expires_at=clock_timestamp()-interval \'1 second\' WHERE token_hash=$1', [lifecycle.input.operator.loginSessionHash])
      await expect(finishRecoveryContinuationAuthority(db, current, new Date(Date.now() + 10000).toISOString(), { operator: lifecycle.input.operator.loginSessionHash })).rejects.toThrow()
    })
  })
})
