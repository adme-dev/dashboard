import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generationRun: vi.fn(),
  videoReadRun: vi.fn(),
  videoPersist: vi.fn(),
  bannerReadRun: vi.fn(),
  bannerResolveProject: vi.fn(),
  bannerPersist: vi.fn(),
  bannerCreate: vi.fn()
}))

vi.mock('~~/server/utils/ai/mcp/generationRunner', () => ({
  buildGenerationRunner: () => ({
    generate_voiceover: mocks.generationRun,
    start_music_generation: vi.fn(),
    get_generation_status: vi.fn()
  })
}))

vi.mock('~~/server/utils/ai/mcp/videoRunner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/ai/mcp/videoRunner')>()
  return {
    ...actual,
    buildVideoReadRunner: () => ({ list_av_projects: mocks.videoReadRun }),
    buildVideoProposeDeps: () => ({
      resolveProject: vi.fn(),
      getModel: vi.fn(),
      isTenantModel: vi.fn(),
      loadSources: vi.fn(),
      loadPolicy: vi.fn(),
      evaluateCompliance: vi.fn(),
      estimateCost: vi.fn(),
      persist: mocks.videoPersist
    })
  }
})

vi.mock('~~/server/utils/ai/mcp/bannerRunner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/ai/mcp/bannerRunner')>()
  return {
    ...actual,
    buildBannerReadRunner: () => ({ list_banner_projects: mocks.bannerReadRun }),
    buildBannerProposeDeps: () => ({
      resolveProject: mocks.bannerResolveProject,
      persist: mocks.bannerPersist
    }),
    createBannerProjectDraft: mocks.bannerCreate
  }
})

import { registry } from '~~/server/utils/ai/tools'
import { resolveGodModeMcpExecution } from '~~/server/utils/ai/mcp/registry'

const context = {
  tools: registry,
  role: 'owner',
  scopes: ['mcp:read'],
  requireWriteScope: true,
  suiteFlags: {
    generation: false,
    writes: false,
    financial: false,
    video: false,
    videoGeneration: false,
    banners: false
  }
}

const toolContext = {
  userId: '11111111-1111-4111-8111-111111111111',
  userRole: 'owner',
  source: 'mcp' as const,
  event: { context: {} } as any
}

describe('registered supplemental MCP execution handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generationRun.mockResolvedValue({ assetId: 'voice-1' })
    mocks.videoReadRun.mockResolvedValue([{ id: 'project-1' }])
    mocks.videoPersist.mockResolvedValue('22222222-2222-4222-8222-222222222222')
    mocks.bannerReadRun.mockResolvedValue({ projects: [{ id: 'banner-1' }] })
    mocks.bannerResolveProject.mockResolvedValue({ id: 'banner-1', name: 'Banner', formats: ['300x250'] })
    mocks.bannerPersist.mockResolvedValue({ proposalId: '33333333-3333-4333-8333-333333333333' })
    mocks.bannerCreate.mockResolvedValue({ ok: true, data: { projectId: 'banner-created', status: 'draft' } })
  })

  it('connects generation manifests to the real generation runner factory', async () => {
    const execution = resolveGodModeMcpExecution(context, 'generate_voiceover')!
    const result = await execution.tool.handler({ text: 'Owner voiceover', lang: 'en', channels: [] }, toolContext)

    expect(result).toEqual({ ok: true, data: { assetId: 'voice-1' } })
    expect(mocks.generationRun).toHaveBeenCalledTimes(1)
  })

  it('connects video read and proposal manifests to their real runner factories', async () => {
    const read = resolveGodModeMcpExecution(context, 'list_av_projects')!
    const propose = resolveGodModeMcpExecution(context, 'create_video_project')!

    await expect(read.tool.handler({}, toolContext)).resolves.toEqual({
      ok: true,
      data: [{ id: 'project-1' }]
    })
    await expect(propose.tool.handler({ title: 'Owner video', clientId: null }, toolContext)).resolves.toMatchObject({
      ok: true,
      data: { proposalId: '22222222-2222-4222-8222-222222222222', kind: 'video_project_create' }
    })
  })

  it('connects banner read and proposal manifests to their real runner factories', async () => {
    const read = resolveGodModeMcpExecution(context, 'list_banner_projects')!
    const propose = resolveGodModeMcpExecution(context, 'propose_banner_render')!

    await expect(read.tool.handler({}, toolContext)).resolves.toMatchObject({ ok: true })
    await expect(propose.tool.handler({ project: 'Banner', format: '300x250' }, toolContext)).resolves.toEqual({
      ok: true,
      data: { proposalId: '33333333-3333-4333-8333-333333333333' }
    })
    expect(mocks.bannerPersist).toHaveBeenCalledTimes(1)
  })

  it('connects banner creation to the local transactional God mode executor', async () => {
    const create = resolveGodModeMcpExecution(context, 'create_banner_project')!
    const db = { query: vi.fn() }

    expect(create).toMatchObject({
      name: 'create_banner_project',
      canonicalName: 'create_banner_project',
      kind: 'supplemental',
      executionClass: 'local-transactional',
      tool: { mutates: true },
    })
    await expect(create.executeMutation!(
      { name: 'CP', headline: 'CP', format: 'mrec' },
      toolContext,
      db,
    )).resolves.toEqual({ ok: true, data: { projectId: 'banner-created', status: 'draft' } })
    expect(mocks.bannerCreate).toHaveBeenCalledWith(
      { name: 'CP', headline: 'CP', format: 'mrec' },
      toolContext,
      db,
    )
  })
})
