import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  getFileMetadata: vi.fn(),
  getPresignedDownloadUrl: vi.fn(),
  loadSources: vi.fn(),
  recordInvocation: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({ queryOne: (...args: unknown[]) => mocks.queryOne(...args) }))
vi.mock('~~/server/utils/storage', () => ({
  getFileMetadata: (...args: unknown[]) => mocks.getFileMetadata(...args),
  getPresignedDownloadUrl: (...args: unknown[]) => mocks.getPresignedDownloadUrl(...args)
}))
vi.mock('~~/server/utils/video-generation/sourceAssetStore', () => ({
  loadSourceAssetsByIds: (...args: unknown[]) => mocks.loadSources(...args),
  assertResolvableSources: (rows: unknown[]) => rows
}))
vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mocks.recordInvocation(...args)
}))

const passing = {
  vehicleMatchesReference: true,
  badgeVisibleAndCorrect: true,
  disclaimerPresent: true,
  priceMatchesBrief: true,
  logoPresentUndistorted: true,
  artefactsDetected: false,
  confidence: 0.95,
  notes: 'Approved source inspected.'
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as any).useRuntimeConfig = () => ({
    aiGatewayUrl: 'https://gateway.ai.cloudflare.com/v1/account/gateway/groq',
    groqApiKey: 'groq-test'
  })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify(passing) } }] })))
  mocks.getFileMetadata.mockResolvedValue({ size: 1024, contentType: 'image/png' })
  mocks.getPresignedDownloadUrl.mockResolvedValue('https://files.example.com/source.png?signature=test')
  mocks.recordInvocation.mockResolvedValue(undefined)
})

describe('creative compliance approved video-source target', () => {
  it('accepts an approved source asset as the inspected target and persists source_asset_id evidence', async () => {
    const source = {
      id: '8b099a86-d107-4f09-a613-9e92ab083c68',
      r2_key: 'media-image/source.png',
      client_id: '6ff24c19-b238-465e-a4e2-fba84e8a4f42',
      status: 'approved',
      content_type: 'image/png'
    }
    mocks.queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce({ id: 'check-1', created_at: '2026-08-20T00:00:00Z' })
    mocks.loadSources.mockResolvedValue([source])

    const { runCreativeComplianceCheck } = await import('~~/server/utils/creativeCompliance')
    const result = await runCreativeComplianceCheck({
      assetId: source.id,
      clientId: source.client_id,
      createdBy: '6a5d0000-0000-4000-8000-000000000001',
      subjectType: 'vehicle',
      referenceSourceAssetIds: []
    })

    expect(result).toMatchObject({ checkId: 'check-1', assetId: source.id, passed: true })
    expect(mocks.loadSources).toHaveBeenCalledWith([source.id])
    const insertSql = String(mocks.queryOne.mock.calls[2]?.[0])
    const insertParams = mocks.queryOne.mock.calls[2]?.[1] as unknown[]
    expect(insertSql).toContain('source_asset_id')
    expect(insertParams[1]).toBeNull()
    expect(insertParams[2]).toBe(source.id)
  })
})
