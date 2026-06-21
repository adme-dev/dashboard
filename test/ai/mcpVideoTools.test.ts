import { describe, it, expect, vi } from 'vitest'

import {
  videoReadTools,
  projectVideoReadTools,
  executeVideoTool,
  filterUsableAvProjects,
  type VideoReadRunner
} from '~~/server/utils/ai/mcp/videoTools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

// Deterministic RBAC: only 'admin' holds any permission (so only admin has CREATIVE).
// Mirrors test/ai/mcpGenerationTools.test.ts so the non-CREATIVE role is simply "any non-admin".
vi.mock('~~/server/utils/permissions', () => ({
  roleHasPermission: (role: string) => role === 'admin'
}))

const ctx = (role: string, userId = 'u1'): ToolContext => ({ userId, userRole: role, event: {} as never, source: 'mcp' })

const READ_NAMES = ['list_av_projects', 'list_video_models', 'list_video_generations', 'get_video_generation_status']

describe('projectVideoReadTools', () => {
  it('returns no tools when the suite flag is off', () => {
    expect(projectVideoReadTools('admin', false)).toEqual([])
  })

  it('returns the 4 read tools for a CREATIVE role when the flag is on', () => {
    expect(projectVideoReadTools('admin', true).map(t => t.name)).toEqual(READ_NAMES)
  })

  it('returns no tools for a role lacking CREATIVE', () => {
    expect(projectVideoReadTools('viewer', true)).toEqual([])
  })

  it('exposes exactly four read descriptors', () => {
    expect(videoReadTools.map(t => t.name)).toEqual(READ_NAMES)
  })
})

describe('filterUsableAvProjects', () => {
  const proj = (id: string, mediaType: string, createdBy: string) => ({ id, mediaType, createdBy } as never)

  it('keeps only av projects; admin/owner see all, others see own', () => {
    const all = [proj('a', 'av', 'u2'), proj('b', 'audio', 'u1'), proj('c', 'av', 'u1')]
    expect(filterUsableAvProjects(all, { id: 'u1', role: 'producer' }).map(p => p.id)).toEqual(['c'])
    expect(filterUsableAvProjects(all, { id: 'u1', role: 'admin' }).map(p => p.id)).toEqual(['a', 'c'])
    expect(filterUsableAvProjects(all, { id: 'u1', role: 'owner' }).map(p => p.id)).toEqual(['a', 'c'])
  })
})

describe('executeVideoTool guard (never throws)', () => {
  const runner = (): VideoReadRunner => ({ list_av_projects: vi.fn(async () => [{ id: 'a' }]) })

  it('disabled when the flag is off', async () => {
    const r = await executeVideoTool('list_av_projects', {}, ctx('admin'), { enabled: false, runner: runner() })
    expect(r).toMatchObject({ ok: false, code: 'disabled' })
  })

  it('not_found for an unknown tool', async () => {
    const r = await executeVideoTool('nope', {}, ctx('admin'), { enabled: true, runner: runner() })
    expect(r).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('forbidden for a role lacking CREATIVE', async () => {
    const r = await executeVideoTool('list_av_projects', {}, ctx('viewer'), { enabled: true, runner: runner() })
    expect(r).toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('bad_args when args fail Zod', async () => {
    const r = await executeVideoTool('get_video_generation_status', { jobId: 'not-a-uuid' }, ctx('admin'), { enabled: true, runner: runner() })
    expect(r).toMatchObject({ ok: false, code: 'bad_args' })
  })

  it('handler_error when the runner throws', async () => {
    const r = await executeVideoTool('list_av_projects', {}, ctx('admin'), {
      enabled: true,
      runner: { list_av_projects: vi.fn(async () => { throw new Error('x') }) }
    })
    expect(r).toMatchObject({ ok: false, code: 'handler_error' })
  })

  it('ok passes runner data through', async () => {
    const r = await executeVideoTool('list_av_projects', {}, ctx('admin'), { enabled: true, runner: runner() })
    expect(r).toEqual({ ok: true, data: [{ id: 'a' }] })
  })
})
