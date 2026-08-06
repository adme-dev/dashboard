import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

import {
  getGodModeRouteAuditState,
  prepareRegisteredGodModeMutation,
  seedGodModeRouteAuditState
} from '../../../server/utils/godMode/featureGate'
import {
  executeGodModeBannerAssetUpload,
  prepareGodModeBannerAssetUpload,
  registerGodModeBannerAssetUploadFamily,
  type BannerAssetUploadResult
} from '../../../server/utils/banner/godModeAssetUpload'

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const ASSET_ID = '22222222-2222-4222-8222-222222222222'
const CORRELATION_ID = '33333333-3333-4333-8333-333333333333'
const ROUTE = 'POST /api/agency/banner-studio/assets/upload'
const REQUEST_DIGEST = 'b'.repeat(64)
const R2_KEY = 'banner-assets/owner/object/car.jpg'

const asset: BannerAssetUploadResult = {
  id: ASSET_ID,
  name: 'launch-car.jpg',
  mimeType: 'image/jpeg',
  fileSize: 4,
  r2Key: R2_KEY,
  url: 'https://cdn.example.com/launch-car.jpg',
  thumbnailUrl: null,
  tags: [],
  uploadedBy: ACTOR_ID,
  createdAt: '2026-08-05T00:00:00.000Z'
}
const resultFactory = (
  stored: { key: string, url: string, size: number },
  identity: { assetId: string, r2Key: string }
): BannerAssetUploadResult => ({
  ...asset,
  id: identity.assetId,
  r2Key: identity.r2Key,
  url: stored.url,
  fileSize: stored.size
})

function request(options: { idempotencyKey?: string, digest?: string, route?: string, correlationId?: string } = {}) {
  const route = options.route ?? ROUTE
  const path = route.slice(route.indexOf(' ') + 1)
  const headers: Record<string, string> = { host: 'app.xeroflow.test' }
  if (options.idempotencyKey !== undefined) headers['idempotency-key'] = options.idempotencyKey
  else headers['idempotency-key'] = 'banner-upload-12345678'
  if (options.digest !== undefined) headers['x-banner-upload-digest'] = options.digest
  else headers['x-banner-upload-digest'] = REQUEST_DIGEST
  const event = {
    method: 'POST',
    path,
    context: { user: { id: ACTOR_ID } },
    node: {
      req: { originalUrl: path, headers, connection: {} },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  } as unknown as H3Event
  seedGodModeRouteAuditState(event, {
    actorUserId: ACTOR_ID,
    correlationId: options.correlationId ?? CORRELATION_ID,
    sessionDigest: 'a'.repeat(64),
    routeOrTool: route,
    emergencyDisabled: false
  })
  return event
}

function terminal(phase: 'succeeded' | 'failed' = 'succeeded') {
  return {
    actorUserId: ACTOR_ID,
    correlationId: CORRELATION_ID,
    sessionDigest: 'a'.repeat(64),
    channel: 'application' as const,
    routeOrTool: ROUTE,
    phase,
    bypassedControls: [],
    outcomeCode: phase === 'succeeded' ? 'http_2xx' : 'http_5xx',
    emergencyDisabled: false
  }
}

describe('God mode banner asset upload coordination', () => {
  const appendAudit = vi.fn()
  const deleteBannerFile = vi.fn()
  const queryOneFresh = vi.fn()
  const getTransactionFailureStage = vi.fn(() => 'definite_rollback' as const)
  const query = vi.fn()
  const transaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => callback({ query }))
  const dependencies = { transaction, appendAudit, deleteBannerFile, queryOneFresh, getTransactionFailureStage }

  beforeEach(() => {
    vi.clearAllMocks()
    queryOneFresh.mockResolvedValue(null)
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [{ state: 'in_progress' }] }
      if (sql.includes('FROM god_mode_execution_ledger')) {
        return { rows: [{
          state: 'in_progress',
          result_reference: null,
          route_or_tool: ROUTE,
          correlation_id: CORRELATION_ID,
          request_digest: REQUEST_DIGEST
        }] }
      }
      if (sql.includes('execution_phase = \'dispatched\'')) return { rows: [{ state: 'in_progress' }] }
      if (sql.includes('INSERT INTO banner_assets')) return { rows: [asset] }
      return { rows: [] }
    })
  })

  it.each([
    ['missing idempotency key', { idempotencyKey: '' }],
    ['invalid idempotency key', { idempotencyKey: 'short key' }],
    ['missing upload digest', { digest: '' }],
    ['malformed upload digest', { digest: 'not-a-sha256' }]
  ])('rejects a %s before admitting storage or database work', async (_case, options) => {
    await expect(prepareGodModeBannerAssetUpload(request(options), dependencies))
      .rejects.toMatchObject({ statusCode: 428 })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('registers only the exact POST asset-upload route family', async () => {
    const unregister = registerGodModeBannerAssetUploadFamily(dependencies)
    try {
      const sibling = request({ route: 'POST /api/agency/banner-studio/assets/asset-1/delete' })
      await expect(prepareRegisteredGodModeMutation(sibling))
        .rejects.toMatchObject({ reason: 'required' })

      const exact = request()
      await prepareRegisteredGodModeMutation(exact)
      await getGodModeRouteAuditState(exact)!.mutationCoordination!.persistTerminal(terminal('failed'))

      expect(transaction).toHaveBeenCalledTimes(2)
    } finally {
      unregister()
    }
  })

  it('binds one upload digest to one stable owner key and replays the stored asset', async () => {
    const ledger = new Map<string, { state: string, resultReference: string | null, route: string, digest: string }>()
    const assets = new Map<string, BannerAssetUploadResult>()
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const key = `${params[0]}:${params[1]}`
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) {
        if (ledger.has(key)) return { rows: [] }
        ledger.set(key, { state: 'in_progress', resultReference: null, route: String(params[3]), digest: String(params[5]) })
        return { rows: [{ state: 'in_progress' }] }
      }
      if (sql.includes('FROM god_mode_execution_ledger')) {
        const row = ledger.get(key)
        return {
          rows: row
            ? [{
                state: row.state,
                result_reference: row.resultReference,
                route_or_tool: row.route,
                correlation_id: CORRELATION_ID,
                request_digest: row.digest
              }]
            : []
        }
      }
      if (sql.includes('execution_phase = \'dispatched\'')) return { rows: [{ state: 'in_progress' }] }
      if (sql.includes('UPDATE god_mode_execution_ledger')) {
        const row = ledger.get(key)!
        row.state = sql.includes('state = \'succeeded\'') ? 'succeeded' : 'failed'
        row.resultReference = params[3] ? String(params[3]) : null
        return { rows: [] }
      }
      if (sql.includes('INSERT INTO banner_assets')) {
        assets.set(ASSET_ID, asset)
        return { rows: [asset] }
      }
      if (sql.includes('FROM banner_assets')) return { rows: assets.has(String(params[0])) ? [assets.get(String(params[0]))] : [] }
      return { rows: [] }
    })
    const uploadFile = vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize })
    const insertAsset = vi.fn(async (db: { query: typeof query } | null) =>
      (await db!.query('INSERT INTO banner_assets RETURNING id')).rows[0] as BannerAssetUploadResult)

    const firstEvent = request()
    const firstPrepared = await prepareGodModeBannerAssetUpload(firstEvent, dependencies)
    const created = await executeGodModeBannerAssetUpload(firstEvent, { assetId: ASSET_ID, r2Key: R2_KEY, result: resultFactory, uploadFile, insertAsset })
    await firstPrepared.persistTerminal(terminal())

    queryOneFresh.mockResolvedValue(asset)
    const replayEvent = request()
    const replayPrepared = await prepareGodModeBannerAssetUpload(replayEvent, dependencies)
    const replayed = await executeGodModeBannerAssetUpload(replayEvent, { assetId: ASSET_ID, r2Key: R2_KEY, result: resultFactory, uploadFile, insertAsset })
    await replayPrepared.persistTerminal(terminal())

    expect(uploadFile).toHaveBeenCalledTimes(1)
    expect(insertAsset).toHaveBeenCalledTimes(1)
    expect(replayed.id).toBe(created.id)
    expect(appendAudit).toHaveBeenLastCalledWith(terminal(), expect.objectContaining({ query }))
    expect(deleteBannerFile).not.toHaveBeenCalled()
  })

  it('waits for a concurrent same-key owner and replays without a second R2 put', async () => {
    const secondCorrelation = '44444444-4444-4444-8444-444444444444'
    let ledger: {
      state: string
      resultReference: string | null
      correlationId: string
      executionPhase: string
    } | null = null
    let storedAsset: BannerAssetUploadResult | null = null
    const durableQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) {
        if (ledger) return { rows: [] }
        ledger = { state: 'in_progress', resultReference: null, correlationId: String(params[2]), executionPhase: 'claimed' }
        return { rows: [{ state: 'in_progress' }] }
      }
      if (sql.includes('FROM god_mode_execution_ledger')) {
        return { rows: ledger
          ? [{
              state: ledger.state,
              result_reference: ledger.resultReference,
              route_or_tool: ROUTE,
              correlation_id: ledger.correlationId,
              execution_phase: ledger.executionPhase,
              request_digest: REQUEST_DIGEST,
              claim_stale: false
            }]
          : [] }
      }
      if (sql.includes('execution_phase = \'dispatched\'')) {
        ledger!.executionPhase = 'dispatched'
        return { rows: [{ state: ledger!.state }] }
      }
      if (sql.includes('state = \'succeeded\'')) {
        ledger!.state = 'succeeded'
        ledger!.resultReference = String(params[3])
        ledger!.executionPhase = 'result_captured'
        return { rows: [{ state: ledger!.state }] }
      }
      return { rows: [] }
    })
    const durableTransaction = vi.fn(async callback => await callback({ query: durableQuery }))
    const durableFresh = vi.fn(async (sql: string) => {
      if (sql.includes('god_mode_execution_ledger') && ledger) {
        return {
          state: ledger.state,
          result_reference: ledger.resultReference,
          route_or_tool: ROUTE,
          request_digest: REQUEST_DIGEST,
          ...(storedAsset ?? {})
        }
      }
      if (sql.includes('FROM banner_assets')) return storedAsset
      return null
    })
    const concurrentDependencies = {
      ...dependencies,
      transaction: durableTransaction as typeof transaction,
      queryOneFresh: durableFresh as typeof queryOneFresh
    }
    const firstEvent = request()
    const secondEvent = request({ correlationId: secondCorrelation })
    const firstPrepared = await prepareGodModeBannerAssetUpload(firstEvent, concurrentDependencies)
    const secondPrepared = await prepareGodModeBannerAssetUpload(secondEvent, concurrentDependencies)
    const uploadFile = vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize })
    const insertAsset = vi.fn(async () => {
      storedAsset = asset
      return asset
    })

    await executeGodModeBannerAssetUpload(firstEvent, { assetId: ASSET_ID, r2Key: R2_KEY, result: resultFactory, uploadFile, insertAsset })
    const concurrentReplay = executeGodModeBannerAssetUpload(secondEvent, {
      r2Key: 'banner-assets/owner/should-not-be-used.jpg',
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile,
      insertAsset
    })
    await firstPrepared.persistTerminal(terminal())
    const replayed = await concurrentReplay
    await secondPrepared.persistTerminal({ ...terminal(), correlationId: secondCorrelation })

    expect(replayed).toEqual(asset)
    expect(uploadFile).toHaveBeenCalledTimes(1)
    expect(insertAsset).toHaveBeenCalledTimes(1)
  })

  it('reclaims a stale pre-storage crash and closes the superseded attempt before retrying', async () => {
    const expiredCorrelation = '55555555-5555-4555-8555-555555555555'
    const ledger = {
      state: 'in_progress',
      resultReference: null as string | null,
      correlationId: expiredCorrelation,
      executionPhase: 'claimed'
    }
    const crashQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [] }
      if (sql.includes('FROM god_mode_execution_ledger')) return { rows: [{
        state: ledger.state,
        result_reference: ledger.resultReference,
        route_or_tool: ROUTE,
        correlation_id: ledger.correlationId,
        execution_phase: ledger.executionPhase,
        request_digest: REQUEST_DIGEST,
        claim_stale: true
      }] }
      if (sql.includes('claim_lease_expired')) return { rows: [{ correlation_id: expiredCorrelation }] }
      if (sql.includes('SET correlation_id = $3')) {
        ledger.correlationId = String(params[2])
        ledger.executionPhase = 'claimed'
        return { rows: [{ state: 'in_progress' }] }
      }
      if (sql.includes('execution_phase = \'dispatched\'')) {
        ledger.executionPhase = 'dispatched'
        return { rows: [{ state: 'in_progress' }] }
      }
      if (sql.includes('state = \'succeeded\'')) {
        ledger.state = 'succeeded'
        ledger.resultReference = String(params[3])
        return { rows: [{ state: 'succeeded' }] }
      }
      if (sql.includes('INSERT INTO banner_assets')) return { rows: [asset] }
      return { rows: [] }
    })
    const crashTransaction = vi.fn(async callback => await callback({ query: crashQuery }))
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, {
      ...dependencies,
      transaction: crashTransaction as typeof transaction
    })
    const uploadFile = vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize })

    await expect(executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile,
      insertAsset: vi.fn().mockResolvedValue(asset)
    })).resolves.toEqual(asset)
    await prepared.persistTerminal(terminal())

    expect(crashQuery).toHaveBeenCalledWith(expect.stringContaining('claim_lease_expired'), expect.any(Array))
    expect(uploadFile).toHaveBeenCalledTimes(1)
    expect(appendAudit).toHaveBeenCalledWith(terminal(), expect.anything())
  })

  it('resumes a stale post-dispatch crash with the durable asset identity and leaves one object and asset', async () => {
    const expiredCorrelation = '66666666-6666-4666-8666-666666666666'
    const candidateAssetId = '77777777-7777-4777-8777-777777777777'
    const candidateKey = 'banner-assets/owner/new-candidate/car.jpg'
    const objects = new Set([R2_KEY])
    const assets = new Map<string, BannerAssetUploadResult>()
    const ledger = {
      state: 'in_progress',
      resultReference: null as string | null,
      correlationId: expiredCorrelation,
      executionPhase: 'dispatched',
      r2Key: R2_KEY,
      assetId: ASSET_ID
    }
    const retryQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [] }
      if (sql.includes('FROM god_mode_execution_ledger')) return { rows: [{
        state: ledger.state,
        result_reference: ledger.resultReference,
        route_or_tool: ROUTE,
        correlation_id: ledger.correlationId,
        execution_phase: ledger.executionPhase,
        request_digest: REQUEST_DIGEST,
        r2_key: ledger.r2Key,
        asset_id: ledger.assetId,
        claim_stale: true
      }] }
      if (sql.includes('claim_lease_expired')) return { rows: [{ id: expiredCorrelation }] }
      if (sql.includes('SET correlation_id = $3')) {
        ledger.correlationId = String(params[2])
        return { rows: [{ state: 'in_progress' }] }
      }
      if (sql.includes('execution_phase = \'dispatched\'')) return { rows: [{ state: 'in_progress' }] }
      if (sql.includes('INSERT INTO banner_assets')) {
        const inserted = { ...asset, id: ledger.assetId, r2Key: ledger.r2Key }
        assets.set(inserted.id, inserted)
        return { rows: [inserted] }
      }
      if (sql.includes('state = \'succeeded\'')) {
        ledger.state = 'succeeded'
        ledger.resultReference = String(params[3])
        return { rows: [{ state: 'succeeded' }] }
      }
      return { rows: [] }
    })
    const retryTransaction = vi.fn(async callback => await callback({ query: retryQuery }))
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, {
      ...dependencies,
      transaction: retryTransaction as typeof transaction
    })
    const uploadFile = vi.fn(async (key: string, assetId?: string) => {
      expect(key).toBe(R2_KEY)
      expect(assetId).toBe(ASSET_ID)
      objects.add(key)
      return { key, url: asset.url, size: asset.fileSize }
    })

    await expect(executeGodModeBannerAssetUpload(event, {
      assetId: candidateAssetId,
      r2Key: candidateKey,
      result: (stored, identity) => ({
        ...asset,
        id: identity.assetId,
        r2Key: identity.r2Key,
        url: stored.url
      }),
      uploadFile,
      insertAsset: vi.fn(async (_db, _stored, result) => {
        assets.set(result!.id, result!)
        return result!
      })
    })).resolves.toMatchObject({ id: ASSET_ID, r2Key: R2_KEY })
    await prepared.persistTerminal(terminal())

    expect(uploadFile).toHaveBeenCalledTimes(1)
    expect(objects).toEqual(new Set([R2_KEY]))
    expect([...assets.keys()]).toEqual([ASSET_ID])
    expect(ledger.resultReference).toBe(ASSET_ID)
  })

  it('recovers a lost stale-reclaim commit response with the same durable post-dispatch identity', async () => {
    const expiredCorrelation = '88888888-8888-4888-8888-888888888888'
    const candidateAssetId = '99999999-9999-4999-8999-999999999999'
    const candidateKey = 'banner-assets/owner/new-candidate/lost-commit.jpg'
    const ledger = {
      state: 'in_progress',
      resultReference: null as string | null,
      correlationId: expiredCorrelation,
      executionPhase: 'dispatched',
      r2Key: R2_KEY,
      assetId: ASSET_ID
    }
    const reclaimQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [] }
      if (sql.includes('FROM god_mode_execution_ledger')) return { rows: [{
        state: ledger.state,
        result_reference: ledger.resultReference,
        route_or_tool: ROUTE,
        correlation_id: ledger.correlationId,
        execution_phase: ledger.executionPhase,
        request_digest: REQUEST_DIGEST,
        r2_key: ledger.r2Key,
        asset_id: ledger.assetId,
        claim_stale: true
      }] }
      if (sql.includes('claim_lease_expired')) return { rows: [{ id: expiredCorrelation }] }
      if (sql.includes('SET correlation_id = $3')) {
        ledger.correlationId = String(params[2])
        return { rows: [{ state: 'in_progress' }] }
      }
      if (sql.includes('execution_phase = \'dispatched\'')) return { rows: [{ state: 'in_progress' }] }
      if (sql.includes('state = \'succeeded\'')) {
        ledger.state = 'succeeded'
        ledger.resultReference = String(params[3])
        return { rows: [{ state: 'succeeded' }] }
      }
      return { rows: [] }
    })
    let transactionAttempt = 0
    const reclaimTransaction = vi.fn(async (callback) => {
      const result = await callback({ query: reclaimQuery })
      if (++transactionAttempt === 1) throw new Error('COMMIT response lost')
      return result
    })
    const reclaimFresh = vi.fn().mockResolvedValue({
      state: 'in_progress',
      result_reference: null,
      route_or_tool: ROUTE,
      correlation_id: CORRELATION_ID,
      execution_phase: 'dispatched',
      request_digest: REQUEST_DIGEST,
      r2_key: R2_KEY,
      asset_id: ASSET_ID
    })
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, {
      ...dependencies,
      transaction: reclaimTransaction as typeof transaction,
      queryOneFresh: reclaimFresh as typeof queryOneFresh,
      getTransactionFailureStage: () => 'ambiguous_commit'
    })
    const uploadFile = vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize })

    await expect(executeGodModeBannerAssetUpload(event, {
      assetId: candidateAssetId,
      r2Key: candidateKey,
      result: (stored, identity) => ({ ...asset, id: identity.assetId, r2Key: identity.r2Key, url: stored.url }),
      uploadFile,
      insertAsset: vi.fn().mockImplementation(async (_db, _stored, result) => result)
    })).resolves.toMatchObject({ id: ASSET_ID, r2Key: R2_KEY })
    await prepared.persistTerminal(terminal())

    expect(uploadFile).toHaveBeenCalledWith(R2_KEY, ASSET_ID)
  })

  it('commits the durable claim before native R2 work and finalizes on a fresh transaction connection', async () => {
    let firstConnectionLost = false
    let transactionNumber = 0
    const connectionQueries: string[][] = []
    const isolatedTransaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => {
      const connectionNumber = ++transactionNumber
      const sqls: string[] = []
      connectionQueries.push(sqls)
      const connectionQuery = vi.fn(async (sql: string, params?: unknown[]) => {
        sqls.push(sql)
        if (connectionNumber === 1 && firstConnectionLost) {
          throw Object.assign(new Error('connection terminated after external I/O'), { code: '08006' })
        }
        return await query(sql, params)
      })
      return await callback({ query: connectionQuery as typeof query })
    })
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, {
      ...dependencies,
      transaction: isolatedTransaction
    })

    const created = await executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn(async () => {
        firstConnectionLost = true
        return { key: R2_KEY, url: asset.url, size: asset.fileSize }
      }),
      insertAsset: vi.fn(async (db, stored) => (
        await db!.query('INSERT INTO banner_assets RETURNING id', [stored.key])
      ).rows[0] as BannerAssetUploadResult)
    })
    await prepared.persistTerminal(terminal())

    expect(created).toEqual(asset)
    expect(isolatedTransaction).toHaveBeenCalledTimes(3)
    expect(connectionQueries[0]).not.toEqual(expect.arrayContaining([
      expect.stringContaining('SAVEPOINT'),
      expect.stringContaining('INSERT INTO banner_assets')
    ]))
    expect(connectionQueries[2]).toEqual(expect.arrayContaining([
      expect.stringContaining('INSERT INTO banner_assets'),
      expect.stringContaining('UPDATE god_mode_execution_ledger')
    ]))
  })

  it.each([
    ['another route', { route_or_tool: 'POST /api/agency/banner-studio/exports', request_digest: REQUEST_DIGEST }],
    ['another digest', { route_or_tool: ROUTE, request_digest: 'c'.repeat(64) }]
  ])('rejects a stable key already bound to %s', async (_case, existing) => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [] }
      if (sql.includes('FROM god_mode_execution_ledger')) {
        return { rows: [{ state: 'succeeded', result_reference: ASSET_ID, ...existing }] }
      }
      return { rows: [] }
    })

    await expect(prepareGodModeBannerAssetUpload(request(), dependencies))
      .rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects a failed execution because it is not replayable', async () => {
    const state = 'failed'
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [] }
      if (sql.includes('FROM god_mode_execution_ledger')) {
        return { rows: [{ state, result_reference: ASSET_ID, route_or_tool: ROUTE, request_digest: REQUEST_DIGEST }] }
      }
      return { rows: [] }
    })

    await expect(prepareGodModeBannerAssetUpload(request(), dependencies))
      .rejects.toMatchObject({ statusCode: 409, statusMessage: 'God mode banner asset upload is not safely replayable' })
  })

  it('rejects replay when the durable asset row is missing', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [] }
      if (sql.includes('FROM god_mode_execution_ledger')) {
        return { rows: [{ state: 'succeeded', result_reference: ASSET_ID, route_or_tool: ROUTE, request_digest: REQUEST_DIGEST }] }
      }
      if (sql.includes('FROM banner_assets')) return { rows: [] }
      return { rows: [] }
    })
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, dependencies)

    await expect(executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn(),
      insertAsset: vi.fn()
    })).rejects.toMatchObject({ statusCode: 409 })
    await prepared.persistTerminal(terminal('failed'))
    expect(deleteBannerFile).not.toHaveBeenCalled()
  })

  it('deletes the precomputed key when R2 upload rejects before confirmation', async () => {
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, dependencies)
    const uploadError = new Error('R2 unavailable')

    await expect(executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn().mockRejectedValue(uploadError),
      insertAsset: vi.fn()
    })).rejects.toThrow('R2 unavailable')
    await prepared.persistTerminal(terminal('failed'))

    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO banner_assets'), expect.anything())
    expect(deleteBannerFile).toHaveBeenCalledWith(R2_KEY)
  })

  it('deletes the precomputed R2 key when upload persists the object and then rejects', async () => {
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, dependencies)
    const persistedKeys: string[] = []

    await expect(executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn(async (key: string) => {
        persistedKeys.push(key)
        throw new Error('HEAD response lost')
      }),
      insertAsset: vi.fn()
    })).rejects.toThrow('HEAD response lost')
    await prepared.persistTerminal(terminal('failed'))

    expect(persistedKeys).toEqual([R2_KEY])
    expect(deleteBannerFile).toHaveBeenCalledWith(R2_KEY)
  })

  it('deletes the new R2 object when the short final database insert fails', async () => {
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, dependencies)

    await expect(executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize }),
      insertAsset: vi.fn().mockRejectedValue(new Error('database unavailable'))
    })).resolves.toEqual(asset)
    await expect(prepared.persistTerminal(terminal())).rejects.toThrow('database unavailable')

    expect(deleteBannerFile).toHaveBeenCalledTimes(1)
    expect(deleteBannerFile).toHaveBeenCalledWith(R2_KEY)
  })

  it('keeps concurrent rollback deletion bound to each upload request bucket', async () => {
    const firstKey = 'banner-assets/owner-a/object-a/launch-car.jpg'
    const secondKey = 'banner-assets/owner-b/object-b/launch-car.jpg'
    const firstDelete = vi.fn()
    const secondDelete = vi.fn()
    const firstEvent = request({ idempotencyKey: 'banner-upload-first-1234' })
    const secondEvent = request({ idempotencyKey: 'banner-upload-second-123' })
    const firstPrepared = await prepareGodModeBannerAssetUpload(firstEvent, dependencies)
    const secondPrepared = await prepareGodModeBannerAssetUpload(secondEvent, dependencies)

    const firstExecution = executeGodModeBannerAssetUpload(firstEvent, {
      r2Key: firstKey,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn().mockResolvedValue({ key: firstKey, url: asset.url, size: asset.fileSize }),
      deleteFile: firstDelete,
      insertAsset: vi.fn().mockRejectedValue(new Error('first insert failed'))
    })
    const secondExecution = executeGodModeBannerAssetUpload(secondEvent, {
      r2Key: secondKey,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn().mockResolvedValue({ key: secondKey, url: asset.url, size: asset.fileSize }),
      deleteFile: secondDelete,
      insertAsset: vi.fn().mockRejectedValue(new Error('second insert failed'))
    })

    await expect(firstExecution).resolves.toMatchObject({ r2Key: firstKey })
    await expect(secondExecution).resolves.toMatchObject({ r2Key: secondKey })
    const finalized = await Promise.allSettled([
      firstPrepared.persistTerminal(terminal()),
      secondPrepared.persistTerminal(terminal())
    ])
    expect(finalized.map(result => result.status)).toEqual(['rejected', 'rejected'])

    expect(firstDelete).toHaveBeenCalledWith(firstKey)
    expect(firstDelete).not.toHaveBeenCalledWith(secondKey)
    expect(secondDelete).toHaveBeenCalledWith(secondKey)
    expect(secondDelete).not.toHaveBeenCalledWith(firstKey)
    expect(deleteBannerFile).not.toHaveBeenCalled()
  })

  it('still deletes the new R2 object when finalization rolls back', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [{ state: 'in_progress' }] }
      if (sql.includes('FROM god_mode_execution_ledger')) return { rows: [{
        state: 'in_progress', result_reference: null, route_or_tool: ROUTE,
        correlation_id: CORRELATION_ID, request_digest: REQUEST_DIGEST
      }] }
      if (sql.includes('execution_phase = \'dispatched\'')) return { rows: [{ state: 'in_progress' }] }
      return { rows: [] }
    })
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, dependencies)

    await expect(executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize }),
      insertAsset: vi.fn().mockRejectedValue(new Error('database unavailable'))
    })).resolves.toEqual(asset)
    await expect(prepared.persistTerminal(terminal())).rejects.toThrow('database unavailable')

    expect(deleteBannerFile).toHaveBeenCalledWith(R2_KEY)
  })

  it('deletes the new R2 object when terminal audit cannot commit', async () => {
    appendAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    let finishDeletion!: () => void
    deleteBannerFile.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishDeletion = resolve
    }))
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, dependencies)
    await executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize }),
      insertAsset: vi.fn().mockResolvedValue(asset)
    })

    const persistence = prepared.persistTerminal(terminal())
    let surfaced = false
    persistence.catch(() => {
      surfaced = true
    })
    await vi.waitFor(() => expect(deleteBannerFile).toHaveBeenCalledWith(R2_KEY))
    await Promise.resolve()
    expect(surfaced).toBe(false)
    finishDeletion()
    await expect(persistence).rejects.toThrow('audit unavailable')
    expect(deleteBannerFile).toHaveBeenCalledWith(R2_KEY)
  })

  it('reconciles an ambiguous commit to the committed asset without deleting R2', async () => {
    const commitResponseLost = new Error('commit response lost')
    let transactionAttempt = 0
    const oneShotTransaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => {
      const result = await callback({ query })
      if (++transactionAttempt === 3) throw commitResponseLost
      return result
    })
    queryOneFresh.mockResolvedValue({
      state: 'succeeded',
      result_reference: ASSET_ID,
      route_or_tool: ROUTE,
      request_digest: REQUEST_DIGEST,
      terminal_phase: 'succeeded',
      ...asset
    })
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, {
      ...dependencies,
      transaction: oneShotTransaction,
      getTransactionFailureStage: () => 'ambiguous_commit'
    })

    const created = await executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize }),
      insertAsset: vi.fn().mockResolvedValue(asset)
    })

    await expect(prepared.persistTerminal(terminal())).resolves.toBeUndefined()
    expect(created).toEqual(asset)
    expect(oneShotTransaction).toHaveBeenCalledTimes(3)
    expect(queryOneFresh).toHaveBeenCalledWith(expect.stringContaining('god_mode_execution_ledger'), [
      ACTOR_ID,
      'banner-upload-12345678'
    ])
    expect(queryOneFresh).toHaveBeenCalledWith(expect.stringMatching(
      /id\s*=\s*CASE\s+WHEN\s+\$1[\s\S]*\$1::uuid/i
    ), [ASSET_ID])
    expect(deleteBannerFile).not.toHaveBeenCalled()
  })

  it('fails closed without deleting R2 when ambiguous-commit reconciliation is unavailable', async () => {
    let transactionAttempt = 0
    const oneShotTransaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => {
      const result = await callback({ query })
      if (++transactionAttempt === 3) throw new Error('commit response lost')
      return result
    })
    queryOneFresh.mockRejectedValue(new Error('fresh database unavailable'))
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, {
      ...dependencies,
      transaction: oneShotTransaction,
      getTransactionFailureStage: () => 'ambiguous_commit'
    })
    await executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize }),
      insertAsset: vi.fn().mockResolvedValue(asset)
    })

    await expect(prepared.persistTerminal(terminal())).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Banner upload recovery required'
    })
    expect(deleteBannerFile).not.toHaveBeenCalled()
  })

  it('keeps R2 and requires recovery when a lost COMMIT response is not yet visible to a fresh read', async () => {
    let transactionAttempt = 0
    const oneShotTransaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => {
      const result = await callback({ query })
      if (++transactionAttempt === 3) throw new Error('commit response lost')
      return result
    })
    queryOneFresh.mockResolvedValue(null)
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, {
      ...dependencies,
      transaction: oneShotTransaction,
      getTransactionFailureStage: () => 'ambiguous_commit'
    })
    await executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize }),
      insertAsset: vi.fn().mockResolvedValue(asset)
    })

    await expect(prepared.persistTerminal(terminal())).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Banner upload recovery required'
    })
    expect(deleteBannerFile).not.toHaveBeenCalled()
  })

  it('deletes R2 when reconciliation confirms the transaction failed', async () => {
    let transactionAttempt = 0
    const oneShotTransaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => {
      const result = await callback({ query })
      if (++transactionAttempt === 3) throw new Error('commit response lost')
      return result
    })
    queryOneFresh.mockResolvedValue({
      state: 'failed',
      result_reference: null,
      route_or_tool: ROUTE,
      request_digest: REQUEST_DIGEST,
      terminal_phase: 'failed'
    })
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, {
      ...dependencies,
      transaction: oneShotTransaction,
      getTransactionFailureStage: () => 'ambiguous_commit'
    })
    await executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize }),
      insertAsset: vi.fn().mockResolvedValue(asset)
    })

    await expect(prepared.persistTerminal(terminal())).rejects.toThrow('commit response lost')
    expect(deleteBannerFile).toHaveBeenCalledWith(R2_KEY)
  })

  it('fails closed when ambiguous-commit reconciliation finds a different result', async () => {
    const differentAssetId = '44444444-4444-4444-8444-444444444444'
    let transactionAttempt = 0
    const oneShotTransaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => {
      const result = await callback({ query })
      if (++transactionAttempt === 3) throw new Error('commit response lost')
      return result
    })
    queryOneFresh.mockResolvedValue({
      ...asset,
      id: differentAssetId,
      state: 'succeeded',
      result_reference: differentAssetId,
      route_or_tool: ROUTE,
      request_digest: REQUEST_DIGEST
    })
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, {
      ...dependencies,
      transaction: oneShotTransaction,
      getTransactionFailureStage: () => 'ambiguous_commit'
    })
    await executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      assetId: ASSET_ID,
      result: resultFactory,
      uploadFile: vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize }),
      insertAsset: vi.fn().mockResolvedValue(asset)
    })

    await expect(prepared.persistTerminal(terminal())).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Banner upload recovery required'
    })
    expect(deleteBannerFile).not.toHaveBeenCalled()
  })

  it('preserves ordinary non-God-Mode upload behavior without ledger coordination', async () => {
    const event = { context: { user: { id: ACTOR_ID } } } as unknown as H3Event
    const uploadFile = vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize })
    const insertAsset = vi.fn().mockResolvedValue(asset)

    await expect(executeGodModeBannerAssetUpload(event, {
      assetId: ASSET_ID,
      r2Key: R2_KEY,
      result: resultFactory,
      uploadFile,
      insertAsset
    })).resolves.toEqual(asset)

    expect(uploadFile).toHaveBeenCalledTimes(1)
    expect(insertAsset).toHaveBeenCalledWith(null, { key: R2_KEY, url: asset.url, size: asset.fileSize }, asset)
    expect(transaction).not.toHaveBeenCalled()
    expect(deleteBannerFile).not.toHaveBeenCalled()
  })

  it('uses the request-owned delete callback when an ordinary upload cannot persist its database row', async () => {
    const event = { context: { user: { id: ACTOR_ID } } } as unknown as H3Event
    const deleteFile = vi.fn()

    await expect(executeGodModeBannerAssetUpload(event, {
      assetId: ASSET_ID,
      r2Key: R2_KEY,
      result: resultFactory,
      uploadFile: vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize }),
      deleteFile,
      insertAsset: vi.fn().mockRejectedValue(new Error('database unavailable'))
    })).rejects.toThrow('database unavailable')

    expect(deleteFile).toHaveBeenCalledWith(R2_KEY)
    expect(deleteBannerFile).not.toHaveBeenCalled()
  })
})
