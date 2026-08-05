// test/ai/mcpBannerTools.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  bannerReadTools, bannerProposeTools, bannerDirectMutationTools, projectBannerTools, resolveBannerProposeAction,
  executeBannerTool, executeBannerPropose, type BannerReadRunner, type BannerProposeDeps,
} from '~~/server/utils/ai/mcp/bannerTools'
import { MCP_CONFIRM_TOOL } from '~~/server/utils/ai/mcp/writeTools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const creativeCtx: ToolContext = { userId: 'u2', userRole: 'creative', event: {} as any }
const outsiderCtx: ToolContext = { userId: 'u3', userRole: 'finance', event: {} as any }

describe('banner tool manifest', () => {
  it('is empty when the flag is off, and lists 4 tools (read+propose+confirm) for CREATIVE when on', () => {
    expect(projectBannerTools('owner', false)).toEqual([])
    const names = projectBannerTools('owner', true).map(t => t.name).sort()
    expect(names).toEqual(['confirm_action', 'get_banner_render_status', 'list_banner_projects', 'propose_banner_render'])
  })
  it('adds create_banner_project only to the active-owner God mode projection', () => {
    const governed = projectBannerTools('owner', true).map(t => t.name)
    const untrustedOptIn = projectBannerTools('owner', true, {
      includeDirectMutations: true,
    }).map(t => t.name)
    const godMode = projectBannerTools('owner', true, {
      bypassPermissions: true,
      includeDirectMutations: true,
    }).map(t => t.name)

    expect(governed).not.toContain('create_banner_project')
    expect(untrustedOptIn).not.toContain('create_banner_project')
    expect(godMode).toContain('create_banner_project')
  })
  it('validates and normalizes the bounded initial banner-create contract', () => {
    const schema = bannerDirectMutationTools[0]!.parameters

    expect(schema.parse({ name: '  CP  ', headline: '  CP launch  ' })).toEqual({
      name: 'CP',
      headline: 'CP launch',
      format: 'mrec',
    })
    expect(schema.safeParse({ name: '', headline: 'CP' }).success).toBe(false)
    expect(schema.safeParse({ name: 'x'.repeat(256), headline: 'CP' }).success).toBe(false)
    expect(schema.safeParse({ name: 'CP', headline: 'x'.repeat(121) }).success).toBe(false)
    expect(schema.safeParse({ name: 'CP', headline: 'CP', format: 'leader' }).success).toBe(false)
    expect(schema.safeParse({ name: 'CP', headline: 'CP', publish: true }).success).toBe(false)
  })
  it('includes confirm_action when enabled', () => {
    const names = projectBannerTools('owner', true).map(t => t.name)
    expect(names).toContain(MCP_CONFIRM_TOOL)
  })
  it('does NOT include confirm_action when disabled', () => {
    const names = projectBannerTools('owner', false).map(t => t.name)
    expect(names).not.toContain(MCP_CONFIRM_TOOL)
  })
  it('hides all banner tools from a non-CREATIVE role even when enabled', () => {
    expect(projectBannerTools('finance', true)).toEqual([])
  })
  it('propose_banner_render is the only confirm action', () => {
    expect(resolveBannerProposeAction('propose_banner_render')).toBe('banner_render')
    expect(resolveBannerProposeAction('list_banner_projects')).toBeNull()
  })
})

describe('executeBannerTool (reads)', () => {
  const runner: BannerReadRunner = {
    list_banner_projects: vi.fn().mockResolvedValue({ projects: [{ id: 'p1', name: 'Acme', formats: ['mrec'], updatedAt: 't' }] }),
    get_banner_render_status: vi.fn().mockResolvedValue({ jobs: [] }),
  }
  it('returns disabled when the flag is off', async () => {
    const r = await executeBannerTool(runner, 'list_banner_projects', {}, creativeCtx, false)
    expect(r.ok).toBe(false); expect((r as any).code).toBe('disabled')
  })
  it('forbids a non-CREATIVE role', async () => {
    const r = await executeBannerTool(runner, 'list_banner_projects', {}, outsiderCtx, true)
    expect(r.ok).toBe(false); expect((r as any).code).toBe('forbidden')
  })
  it('runs the read for CREATIVE when enabled', async () => {
    const r = await executeBannerTool(runner, 'list_banner_projects', {}, creativeCtx, true)
    expect(r.ok).toBe(true); expect((r as any).data.projects).toHaveLength(1)
  })
  it('not_found for an unknown tool', async () => {
    const r = await executeBannerTool(runner, 'nope', {}, ctx, true)
    expect(r.ok).toBe(false); expect((r as any).code).toBe('not_found')
  })
})

describe('executeBannerPropose', () => {
  const deps: BannerProposeDeps = {
    resolveProject: vi.fn().mockResolvedValue({ id: 'p1', name: 'Acme', formats: ['mrec'] }),
    persist: vi.fn().mockResolvedValue({ proposalId: 'prop1' }),
  }
  it('validates project+format and persists a banner_render proposal', async () => {
    const r = await executeBannerPropose('propose_banner_render',
      { project: 'Acme', format: 'mrec', fps: 30, quality: 1 }, creativeCtx, deps, true)
    expect(r.ok).toBe(true)
    expect((r as any).proposalId).toBe('prop1')
    expect((deps.persist as any).mock.calls[0][1]).toBe('banner_render') // action name
    expect((deps.persist as any).mock.calls[0][2]).toMatchObject({ projectId: 'p1', format: 'mrec', fps: 30, quality: 1 })
  })
  it('bad_args when the format is not on the project', async () => {
    const d2: BannerProposeDeps = { resolveProject: vi.fn().mockResolvedValue({ id: 'p1', name: 'Acme', formats: ['leader'] }), persist: vi.fn() }
    const r = await executeBannerPropose('propose_banner_render', { project: 'Acme', format: 'mrec' }, creativeCtx, d2, true)
    expect(r.ok).toBe(false); expect((r as any).code).toBe('bad_args')
    expect(d2.persist).not.toHaveBeenCalled()
  })
  it('disabled when the flag is off; forbidden for non-CREATIVE', async () => {
    expect((await executeBannerPropose('propose_banner_render', { project: 'Acme', format: 'mrec' }, creativeCtx, deps, false) as any).code).toBe('disabled')
    expect((await executeBannerPropose('propose_banner_render', { project: 'Acme', format: 'mrec' }, outsiderCtx, deps, true) as any).code).toBe('forbidden')
  })
})
