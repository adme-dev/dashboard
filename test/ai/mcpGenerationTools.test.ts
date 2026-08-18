import { describe, it, expect, vi } from 'vitest'

import {
  generationTools,
  projectGenerationTools,
  resolveGenerationMcpExecutions,
  executeGenerationTool,
  type GenerationRunner
} from '~~/server/utils/ai/mcp/generationTools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

// Deterministic RBAC: only 'admin' holds any permission (so only admin has CREATIVE).
vi.mock('~~/server/utils/permissions', () => ({
  roleHasPermission: (role: string) => role === 'admin'
}))

const ctx = (role: string): ToolContext => ({ userId: 'u1', userRole: role, event: {} as never })

// A runner that records calls and returns a fixed payload per tool.
const okRunner = (): GenerationRunner => ({
  generate_banner_image: vi.fn(async () => ({ assetId: 'img1', status: 'ready' })),
  generate_voiceover: vi.fn(async () => ({ assetId: 'a1', status: 'ready' })),
  start_music_generation: vi.fn(async () => ({ jobId: 'j1', status: 'queued' })),
  get_generation_status: vi.fn(async () => ({ status: 'done', assetUrl: 'https://x/y.mp3' }))
})

describe('projectGenerationTools', () => {
  it('returns nothing when the group flag is off (dormant by default)', () => {
    expect(projectGenerationTools('admin', false)).toEqual([])
  })

  it('lists all generation tools for a CREATIVE role when enabled', () => {
    const names = projectGenerationTools('admin', true).map(t => t.name)
    expect(names).toEqual(expect.arrayContaining(['generate_banner_image', 'generate_voiceover', 'start_music_generation', 'get_generation_status']))
    expect(names).toHaveLength(generationTools.length)
  })

  it('role-scopes: a role without CREATIVE sees none even when enabled', () => {
    expect(projectGenerationTools('viewer', true)).toEqual([])
  })

  it('emits a JSON Schema inputSchema per tool', () => {
    const m = projectGenerationTools('admin', true).find(t => t.name === 'generate_voiceover')!
    expect(m.inputSchema).toMatchObject({ type: 'object' })
    expect((m.inputSchema as { properties?: Record<string, unknown> }).properties).toHaveProperty('text')
  })
})

describe('executeGenerationTool', () => {
  it('registers a fail-closed provider preflight for music generation', async () => {
    const execution = resolveGenerationMcpExecutions().find(row => row.name === 'start_music_generation')!
    expect(execution.preflight).toBeTypeOf('function')
    if (!execution.preflight) return

    await expect(execution.preflight({}, ctx('admin'))).resolves.toMatchObject({
      ok: false,
      code: 'provider_unavailable',
      statusCode: 503
    })

    await expect(execution.preflight({}, {
      ...ctx('admin'),
      event: { context: { cloudflare: { env: { MUSIC_QUEUE: {} } } } } as any
    })).resolves.toMatchObject({
      ok: false,
      code: 'provider_unavailable',
      statusCode: 503
    })
  })

  it('refuses when the group flag is off, without touching the runner (disabled)', async () => {
    const runner = okRunner()
    const res = await executeGenerationTool('generate_voiceover', { text: 'hello there' }, ctx('admin'), { enabled: false, runner })
    expect(res).toMatchObject({ ok: false, code: 'disabled' })
    expect(runner.generate_voiceover).not.toHaveBeenCalled()
  })

  it('rejects unknown tools', async () => {
    const res = await executeGenerationTool('nope', {}, ctx('admin'), { enabled: true, runner: okRunner() })
    expect(res).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('forbids a role without CREATIVE, without touching the runner', async () => {
    const runner = okRunner()
    const res = await executeGenerationTool('generate_voiceover', { text: 'hello there' }, ctx('viewer'), { enabled: true, runner })
    expect(res).toMatchObject({ ok: false, code: 'forbidden' })
    expect(runner.generate_voiceover).not.toHaveBeenCalled()
  })

  it('rejects args that fail the tool Zod schema (untrusted wire input)', async () => {
    const runner = okRunner()
    const res = await executeGenerationTool('generate_voiceover', { text: '' }, ctx('admin'), { enabled: true, runner })
    expect(res).toMatchObject({ ok: false, code: 'bad_args' })
    expect(runner.generate_voiceover).not.toHaveBeenCalled()
  })

  it('runs an allowed tool and returns its data, passing parsed args + ctx', async () => {
    const runner = okRunner()
    const c = ctx('admin')
    const res = await executeGenerationTool('start_music_generation', { prompt: 'warm acoustic bed' }, c, { enabled: true, runner })
    expect(res).toEqual({ ok: true, data: { jobId: 'j1', status: 'queued' } })
    expect(runner.start_music_generation).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'warm acoustic bed' }), c)
  })

  it('validates and runs direct image generation for a brief sample', async () => {
    const runner = okRunner()
    const c = ctx('admin')
    const res = await executeGenerationTool('generate_banner_image', { prompt: 'SUV at dusk', aspectRatio: '16:9' }, c, { enabled: true, runner })
    expect(res).toEqual({ ok: true, data: { assetId: 'img1', status: 'ready' } })
    expect(runner.generate_banner_image).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'SUV at dusk', aspectRatio: '16:9' }), c)
  })

  it('never throws — a runner that throws becomes a typed handler_error', async () => {
    const runner: GenerationRunner = { generate_voiceover: async () => { throw new Error('boom') } }
    const res = await executeGenerationTool('generate_voiceover', { text: 'hello there' }, ctx('admin'), { enabled: true, runner })
    expect(res).toMatchObject({ ok: false, code: 'handler_error' })
  })
})
