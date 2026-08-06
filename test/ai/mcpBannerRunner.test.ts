// test/ai/mcpBannerRunner.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  createBannerProjectDraft,
  dispatchBannerConfirm,
  buildBannerReadRunner,
  type BannerConfirmDeps,
  type BannerProjectLoaders,
} from '~~/server/utils/ai/mcp/bannerRunner'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const queryRows = vi.hoisted(() => vi.fn())

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => queryRows(...args),
  queryOne: vi.fn(),
  execute: vi.fn()
}))

const ctx: ToolContext = { userId: 'u1', userRole: 'creative', event: {} as any }
const payload = { projectId: 'p1', format: 'mrec', fps: 30, quality: 1 as const }

function deps(over: Partial<BannerConfirmDeps> = {}): BannerConfirmDeps {
  return {
    loadLayers: vi.fn().mockResolvedValue({ layers: [{ id: 'l1' }], width: 300, height: 250 }),
    buildHtml: vi.fn().mockReturnValue('<div>banner</div>'),
    enqueue: vi.fn().mockResolvedValue({ jobIds: ['job1'] }),
    ...over,
  }
}

describe('createBannerProjectDraft', () => {
  it('creates one renderable MRec draft inside the caller-owned transaction', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'project-cp', name: 'CP', status: 'draft' }],
      }),
    }

    const result = await createBannerProjectDraft(
      { name: 'CP', headline: 'CP launch', format: 'mrec' },
      { ...ctx, userId: 'owner-1', userRole: 'owner', source: 'mcp' },
      db,
    )

    expect(result).toEqual({
      ok: true,
      data: {
        projectId: 'project-cp',
        name: 'CP',
        status: 'draft',
        format: 'mrec',
        headline: 'CP launch',
      },
    })
    expect(db.query).toHaveBeenCalledTimes(1)
    const [sql, params] = db.query.mock.calls[0]!
    expect(sql).toMatch(/INSERT INTO banner_projects/i)
    expect(sql).toMatch(/'draft'/i)
    expect(params[0]).toBe('CP')
    expect(params[2]).toBe('owner-1')

    const canvas = JSON.parse(params[1])
    expect(Object.keys(canvas)).toEqual(['mrec'])
    expect(canvas.mrec.bgColor).toBe('#0a0a10')
    expect(canvas.mrec.layers).toHaveLength(2)
    expect(canvas.mrec.layers[0]).toMatchObject({
      id: 1,
      type: 'bg',
      x: 0,
      y: 0,
      w: 300,
      h: 250,
    })
    expect(canvas.mrec.layers[1]).toMatchObject({
      id: 2,
      type: 'text',
      text: 'CP launch',
      w: 260,
    })
    expect(canvas.mrec.layers.every((layer: Record<string, unknown>) => (
      typeof layer.startTime === 'number'
      && typeof layer.animInDur === 'number'
      && typeof layer.endTime === 'number'
    ))).toBe(true)
  })

  it('fails closed when the insert returns no project', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }

    await expect(createBannerProjectDraft(
      { name: 'CP', headline: 'CP', format: 'mrec' },
      { ...ctx, userId: 'owner-1', userRole: 'owner', source: 'mcp' },
      db,
    )).rejects.toMatchObject({ boundedCode: 'banner_project_insert_failed' })
  })
})

// ── C1: canvas_data flat-parse tests ──────────────────────────────────────────

describe('buildBannerReadRunner — canvas_data flat-parse (C1)', () => {
  /** Build an injected-loader runner with a controlled project list. */
  function makeRunner(projects: Array<{ id: string, name: string, canvas_data: unknown, updated_at: string }>) {
    const loaders: BannerProjectLoaders = {
      loadProjectsRows: vi.fn().mockResolvedValue(projects),
      loadProjectRow: vi.fn().mockResolvedValue(projects[0] ?? null),
    }
    return { runner: buildBannerReadRunner(loaders), loaders }
  }

  it('extracts only valid FORMATS keys that have a layers array', async () => {
    // mrec has layers → included; junk is not a real format key → excluded; leader has layers → included
    const canvasData = { mrec: { layers: [] }, junk: { layers: [1, 2] }, leader: { layers: [{ id: 'l1' }] } }
    const { runner } = makeRunner([{ id: 'p1', name: 'Test', canvas_data: canvasData, updated_at: '2024-01-01' }])
    const result = await runner.list_banner_projects({}, ctx) as any
    expect(result.projects[0].formats.sort()).toEqual(['leader', 'mrec'])
  })

  it('excludes a format key whose artboard has no layers array', async () => {
    // mrec present but no layers array → excluded; fb_feed present and has layers → included
    const canvasData = { mrec: { layers: [] }, fb_feed: { layers: [{ id: 'l1' }] }, wsky: {} }
    const { runner } = makeRunner([{ id: 'p2', name: 'Test2', canvas_data: canvasData, updated_at: '2024-01-01' }])
    const result = await runner.list_banner_projects({}, ctx) as any
    expect(result.projects[0].formats.sort()).toEqual(['fb_feed', 'mrec'])
  })

  it('parses a canvas_data JSON string correctly', async () => {
    const canvasData = JSON.stringify({ mrec: { layers: [] }, junk: {} })
    const { runner } = makeRunner([{ id: 'p3', name: 'Test3', canvas_data: canvasData, updated_at: '2024-01-01' }])
    const result = await runner.list_banner_projects({}, ctx) as any
    expect(result.projects[0].formats).toEqual(['mrec'])
  })

  it('returns empty formats for null/undefined canvas_data', async () => {
    const { runner } = makeRunner([{ id: 'p4', name: 'Test4', canvas_data: null, updated_at: '2024-01-01' }])
    const result = await runner.list_banner_projects({}, ctx) as any
    expect(result.projects[0].formats).toEqual([])
  })

  it('resolveBannerProject via injected loader: { mrec: { layers: [] }, junk: {} } → formats ["mrec"]', async () => {
    // Test via buildBannerProposeDeps-style: use the runner's loadProjectRow path indirectly
    const canvasData = { mrec: { layers: [] }, junk: {} }
    const loaders: BannerProjectLoaders = {
      loadProjectsRows: vi.fn().mockResolvedValue([]),
      loadProjectRow: vi.fn().mockResolvedValue({ id: 'p1', name: 'Acme', canvas_data: canvasData }),
    }
    // buildBannerReadRunner uses loaders for list; we test resolve via the same code path
    // by importing buildBannerReadRunner — but resolveBannerProject is internal. We cover
    // the same code via list_banner_projects (same extractFormats call).
    const runner = buildBannerReadRunner({ ...loaders, loadProjectsRows: vi.fn().mockResolvedValue([
      { id: 'p1', name: 'Acme', canvas_data: canvasData, updated_at: '2024-01-01' }
    ]) })
    const result = await runner.list_banner_projects({}, ctx) as any
    expect(result.projects[0].formats).toEqual(['mrec'])
  })
})

describe('buildBannerReadRunner — render status', () => {
  it('never returns a persisted public R2 URL for completed jobs', async () => {
    queryRows.mockResolvedValueOnce([{
      id: '11111111-1111-4111-8111-111111111111',
      project_id: '22222222-2222-4222-8222-222222222222',
      format_key: 'mrec',
      width: 300,
      height: 250,
      fps: 30,
      crf: 23,
      quality: 1,
      source_r2_key: 'banner-render-jobs/source.html',
      status: 'done',
      url: 'https://pub-old.r2.dev/leaked.mp4',
      file_size: 71546,
      error: null
    }])

    const result = await buildBannerReadRunner().get_banner_render_status({
      jobIds: ['11111111-1111-4111-8111-111111111111']
    }, ctx)

    expect(result).toEqual({
      jobs: [{
        jobId: '11111111-1111-4111-8111-111111111111',
        formatKey: 'mrec',
        status: 'done',
        url: '/api/agency/banner-studio/export-video/jobs/11111111-1111-4111-8111-111111111111/download',
        fileSize: 71546,
        error: null
      }]
    })
  })
})

describe('dispatchBannerConfirm', () => {
  it('loads layers, builds HTML (format first), enqueues, returns jobIds', async () => {
    const d = deps()
    const r = await dispatchBannerConfirm(payload, ctx, d)
    expect(r.ok).toBe(true)
    expect((r as any).data.jobIds).toEqual(['job1'])
    expect((d.loadLayers as any).mock.calls[0]).toEqual(['p1', 'mrec'])
    expect((d.buildHtml as any).mock.calls[0][0]).toBe('mrec')             // format FIRST
    expect((d.buildHtml as any).mock.calls[0][1]).toEqual([{ id: 'l1' }])  // then layers
    const enqArg = (d.enqueue as any).mock.calls[0][0]
    expect(enqArg).toMatchObject({ projectId: 'p1', fps: 30, quality: 1, userId: 'u1' })
    expect(enqArg.formats[0]).toMatchObject({ key: 'mrec', html: '<div>banner</div>', width: 300, height: 250 })
  })
  it('fails gracefully (no enqueue) when the project/format cannot load', async () => {
    const d = deps({ loadLayers: vi.fn().mockRejectedValue(new Error('no format')) })
    const r = await dispatchBannerConfirm(payload, ctx, d)
    expect(r.ok).toBe(false)
    expect(d.enqueue).not.toHaveBeenCalled()
  })
  it('checkpoints at the banner queue send boundary after render preparation', async () => {
    const order: string[] = []
    const d = deps({
      execution: { markDispatched: vi.fn(async () => { order.push('checkpoint') }), captureResult: vi.fn() },
      enqueue: vi.fn(async (_input, enqueueDeps) => {
        order.push('prepared')
        await enqueueDeps.sendQueue({ jobId: 'job1' })
        return { jobIds: ['job1'] }
      })
    })
    const bannerCtx = {
      ...ctx,
      event: { context: { cloudflare: { env: { BANNER_RENDER_QUEUE: { send: vi.fn(async () => { order.push('send') }) } } } } } as any
    }
    await expect(dispatchBannerConfirm(payload, bannerCtx, d)).resolves.toMatchObject({ ok: true })
    expect(order).toEqual(['prepared', 'checkpoint', 'send'])
  })
})
