import { describe, expect, it } from 'vitest'
import { continuationDatabaseUrl, continuationLifecycle } from '../../support/continuationLifecycle'
import { recoveryContinuationCurrentContext, finishRecoveryContinuationAuthority } from '~~/server/utils/pageStudio/customerTransferRecoveryContinuationAuthority'
import { readContinuationSourceInspectionSeed, bindContinuationSourceBootstrap } from '~~/server/utils/pageStudio/continuationSourceInspectionSeed'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'

describe.runIf(Boolean(continuationDatabaseUrl))('retained continuation source inspection input', { timeout: 30000 }, () => {
  const lifecycle = continuationLifecycle()
  it('reconstructs the exact historical readiness request from genuine retained PG rows without inventing its observed bootstrap', async () => {
    const f = await lifecycle.freezeFixture(), pair = await f.prepare()
    const expectedFreeze = await f.envelope()
    const actor = { operator: lifecycle.input.operator }
    const options = { renewalRequestId: f.create.body.renewalRequestId, expectedOriginalHeadDigest: pair.association.enabledHeadDigest }
    await lifecycle.runTransaction(async (db) => {
      const current = await recoveryContinuationCurrentContext(db, f.route, actor, options)
      const seed = await readContinuationSourceInspectionSeed(db, current)
      expect(seed.sourceReady).toEqual(f.getWire())
      expect(seed.freezePreparation).toEqual(pair)
      expect(seed.originalContext).toEqual({
        sourceGeneration: current.intent.source.context.state.active_generation,
        destinationGeneration: current.intent.destination.generation,
        destinationBindingDigest: (await db.query('SELECT binding_digest FROM page_studio_managed_transfer_resource_bindings WHERE operation_id=$1', [current.intent.operationId])).rows[0].binding_digest,
        earlyInventoryDigest: f.getWire().pending.body.reconciliationDigest,
        sourceSnapshotDigest: await collectionDigest({ authority: current.intent.authority, source: current.intent.source })
      })
      expect(seed).not.toHaveProperty('sourceFreeze')
      expect(seed).not.toHaveProperty('result')
      expect(await bindContinuationSourceBootstrap(seed, f.getObserved())).toEqual(expectedFreeze)
      const corrupt = structuredClone(f.getObserved())
      corrupt.selection.execution.identity = 'f'.repeat(64)
      await expect(bindContinuationSourceBootstrap(seed, corrupt)).rejects.toThrow()
      await finishRecoveryContinuationAuthority(db, current, new Date(Date.now() + 10000).toISOString(), {})
    })
  })
  it('preserves historical pins after original expiry while requiring current authority', async () => {
    lifecycle.setReviewLifetime(2000)
    const f = await lifecycle.freezeFixture(), pair = await f.prepare()
    const historical = structuredClone(f.getWire())
    await lifecycle.db.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM deadline-clock_timestamp())+0.03)) FROM page_studio_transfer_recovery_heads')
    await lifecycle.runTransaction(async (db) => {
      const current = await recoveryContinuationCurrentContext(db, f.route, { operator: lifecycle.input.operator }, {
        renewalRequestId: f.create.body.renewalRequestId, expectedOriginalHeadDigest: pair.association.enabledHeadDigest
      })
      expect((await readContinuationSourceInspectionSeed(db, current)).sourceReady).toEqual(historical)
      await finishRecoveryContinuationAuthority(db, current, new Date(Date.now() + 10000).toISOString(), {})
    })
  })
  it('rejects borrowed source identity and corrupted retained descriptor projections', async () => {
    const f = await lifecycle.freezeFixture(), pair = await f.prepare()
    await lifecycle.runTransaction(async (db) => {
      const current = await recoveryContinuationCurrentContext(db, f.route, { operator: lifecycle.input.operator }, {
        renewalRequestId: f.create.body.renewalRequestId, expectedOriginalHeadDigest: pair.association.enabledHeadDigest
      })
      const changed = structuredClone(current)
      changed.intent.sourceDigest = 'f'.repeat(64)
      await expect(readContinuationSourceInspectionSeed(db, changed)).rejects.toThrow()
      // Explicit read-corruption boundary; genuine retained rows stay unchanged.
      const corrupted = new Proxy(db, { get(target, property) {
        if (property !== 'query') return Reflect.get(target, property)
        return async (sql: string, values?: unknown[]) => {
          const result = await db.query(sql, values)
          if (sql.includes('FROM page_studio_transfer_recovery_source_executions')) {
            return { ...result, rows: result.rows.map(row => ({ ...row, descriptor_digest: 'e'.repeat(64) })) }
          }
          return result
        }
      } })
      await expect(readContinuationSourceInspectionSeed(corrupted, current)).rejects.toThrow()
      const seed = await readContinuationSourceInspectionSeed(db, current)
      seed.freezePreparation.association.sourceInstallClaimDigest = 'f'.repeat(64)
      seed.freezePreparation.associationDigest = await collectionDigest(seed.freezePreparation.association)
      await expect(bindContinuationSourceBootstrap(seed, f.getObserved())).rejects.toThrow()
    })
  })
})
