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

function request(options: { idempotencyKey?: string, digest?: string, route?: string } = {}) {
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
    correlationId: CORRELATION_ID,
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

      expect(transaction).toHaveBeenCalledTimes(1)
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
                request_digest: row.digest
              }]
            : []
        }
      }
      if (sql.includes('UPDATE god_mode_execution_ledger')) {
        const row = ledger.get(key)!
        row.state = String(params[2])
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
    const created = await executeGodModeBannerAssetUpload(firstEvent, { r2Key: R2_KEY, uploadFile, insertAsset })
    await firstPrepared.persistTerminal(terminal())

    const replayEvent = request()
    const replayPrepared = await prepareGodModeBannerAssetUpload(replayEvent, dependencies)
    const replayed = await executeGodModeBannerAssetUpload(replayEvent, { r2Key: R2_KEY, uploadFile, insertAsset })
    await replayPrepared.persistTerminal(terminal())

    expect(uploadFile).toHaveBeenCalledTimes(1)
    expect(insertAsset).toHaveBeenCalledTimes(1)
    expect(replayed.id).toBe(created.id)
    expect(appendAudit).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'succeeded', entityType: 'banner_asset', entityId: ASSET_ID
    }), expect.objectContaining({ query }))
    expect(deleteBannerFile).not.toHaveBeenCalled()
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

  it.each(['in_progress', 'failed'])('rejects a %s execution because it is not replayable', async (state) => {
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

  it('deletes the new R2 object when the database insert fails', async () => {
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, dependencies)

    await expect(executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      uploadFile: vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize }),
      insertAsset: vi.fn().mockRejectedValue(new Error('database unavailable'))
    })).rejects.toThrow('database unavailable')
    await prepared.persistTerminal(terminal('failed'))

    expect(deleteBannerFile).toHaveBeenCalledTimes(1)
    expect(deleteBannerFile).toHaveBeenCalledWith(R2_KEY)
  })

  it('still deletes the new R2 object when savepoint rollback also fails', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO god_mode_execution_ledger')) return { rows: [{ state: 'in_progress' }] }
      if (sql.startsWith('ROLLBACK TO SAVEPOINT')) throw new Error('rollback unavailable')
      return { rows: [] }
    })
    const event = request()
    const prepared = await prepareGodModeBannerAssetUpload(event, dependencies)

    await expect(executeGodModeBannerAssetUpload(event, {
      r2Key: R2_KEY,
      uploadFile: vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize }),
      insertAsset: vi.fn().mockRejectedValue(new Error('database unavailable'))
    })).rejects.toThrow('rollback unavailable')
    await prepared.persistTerminal(terminal('failed'))

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
    const oneShotTransaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => {
      await callback({ query })
      throw commitResponseLost
    })
    queryOneFresh.mockResolvedValue({
      state: 'succeeded',
      result_reference: ASSET_ID,
      route_or_tool: ROUTE,
      request_digest: REQUEST_DIGEST,
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
      uploadFile: vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize }),
      insertAsset: vi.fn().mockResolvedValue(asset)
    })

    await expect(prepared.persistTerminal(terminal())).resolves.toBeUndefined()
    expect(created).toEqual(asset)
    expect(oneShotTransaction).toHaveBeenCalledTimes(1)
    expect(queryOneFresh).toHaveBeenCalledWith(expect.stringContaining('god_mode_execution_ledger'), [
      ACTOR_ID,
      'banner-upload-12345678'
    ])
    expect(deleteBannerFile).not.toHaveBeenCalled()
  })

  it('fails closed without deleting R2 when ambiguous-commit reconciliation is unavailable', async () => {
    const oneShotTransaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => {
      await callback({ query })
      throw new Error('commit response lost')
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
    const oneShotTransaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => {
      await callback({ query })
      throw new Error('commit response lost')
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
    const oneShotTransaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => {
      await callback({ query })
      throw new Error('commit response lost')
    })
    queryOneFresh.mockResolvedValue({
      state: 'failed',
      result_reference: null,
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
      uploadFile: vi.fn().mockResolvedValue({ key: R2_KEY, url: asset.url, size: asset.fileSize }),
      insertAsset: vi.fn().mockResolvedValue(asset)
    })

    await expect(prepared.persistTerminal(terminal())).rejects.toThrow('commit response lost')
    expect(deleteBannerFile).toHaveBeenCalledWith(R2_KEY)
  })

  it('fails closed when ambiguous-commit reconciliation finds a different result', async () => {
    const differentAssetId = '44444444-4444-4444-8444-444444444444'
    const oneShotTransaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => {
      await callback({ query })
      throw new Error('commit response lost')
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

    await expect(executeGodModeBannerAssetUpload(event, { r2Key: R2_KEY, uploadFile, insertAsset })).resolves.toEqual(asset)

    expect(uploadFile).toHaveBeenCalledTimes(1)
    expect(insertAsset).toHaveBeenCalledWith(null, { key: R2_KEY, url: asset.url, size: asset.fileSize })
    expect(transaction).not.toHaveBeenCalled()
    expect(deleteBannerFile).not.toHaveBeenCalled()
  })
})
