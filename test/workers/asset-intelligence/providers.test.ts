import { describe, expect, it, vi } from 'vitest'
import { runAssetIntelligenceProvider } from '~~/workers/asset-intelligence/src/providers'

describe('asset intelligence providers', () => {
  it('turns mask-only jobs into a persisted mask derivative without calling AI', async () => {
    const result = await runAssetIntelligenceProvider({
      job: {
        id: 'job-1',
        projectId: 'project-1',
        sourceAssetId: 'asset-1',
        action: 'mask-only',
        modelId: 'replicate/sam-2',
        provider: 'replicate',
        prompt: null,
        brushMaskKey: 'video-asset-masks/project-1/asset-1/mask.png',
      },
      env: { AI: { run: vi.fn() } } as any,
      fetchAssetBytes: vi.fn(),
      copyR2Object: vi.fn().mockResolvedValue({ r2Key: 'video-asset-derivatives/project-1/job-1/mask.png', contentType: 'image/png', size: 128 }),
      uploadJson: vi.fn(),
      uploadBinary: vi.fn(),
    })

    expect(result.derivatives).toEqual([
      expect.objectContaining({
        kind: 'mask-png',
        r2Key: 'video-asset-derivatives/project-1/job-1/mask.png',
      }),
    ])
  })

  it('runs Workers AI analysis jobs and writes analysis JSON', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'hero vehicle, red sand, logo visible' })
    const uploadJson = vi.fn().mockResolvedValue({ r2Key: 'video-asset-derivatives/project-1/job-2/analysis.json', contentType: 'application/json', size: 64 })

    const result = await runAssetIntelligenceProvider({
      job: {
        id: 'job-2',
        projectId: 'project-1',
        sourceAssetId: 'asset-1',
        action: 'asset-analysis',
        modelId: 'workers-ai/kimi-planner',
        provider: 'workers-ai',
        prompt: 'analyze this asset',
        brushMaskKey: null,
      },
      env: { AI: { run } } as any,
      fetchAssetBytes: vi.fn().mockResolvedValue({ dataUri: 'data:image/png;base64,AA==', contentType: 'image/png' }),
      copyR2Object: vi.fn(),
      uploadJson,
      uploadBinary: vi.fn(),
    })

    expect(run).toHaveBeenCalled()
    expect(result.derivatives[0]).toMatchObject({ kind: 'analysis-json' })
  })
})
