import { describe, it, expect, vi } from 'vitest'
import {
  proposeScheduleSocialPost, proposalToSocialPostBody, scheduleSocialPostTool,
  type ScheduleSocialPostDeps
} from '~~/server/utils/ai/tools/scheduleSocialPost'
import { registry } from '~~/server/utils/ai/tools'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'

type ScheduleToolData = {
  proposalId?: string
  resolved?: Record<string, unknown>
  disambiguation?: { field?: string, options?: unknown[] }
}

const ctx = (role = 'producer'): ToolContext => ({
  userId: 'u1',
  userRole: role,
  conversationId: 'c1',
  event: { headers: {} } as unknown as ToolContext['event']
})

const deps = (over: Partial<ScheduleSocialPostDeps> = {}): ScheduleSocialPostDeps => ({
  findClients: vi.fn().mockResolvedValue([{ id: 'cl1', name: 'Acme' }]),
  propose: vi.fn().mockResolvedValue('prop-1'),
  ...over
})

const data = (result: ToolResult): ScheduleToolData => {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.data as ScheduleToolData
}

describe('proposeScheduleSocialPost', () => {
  it('PROPOSES a draft (no scheduledAt) for the resolved client — never posts directly', async () => {
    const d = deps()
    const r = await proposeScheduleSocialPost({ clientName: 'Acme', content: 'Hello world', platforms: ['facebook'] }, ctx(), d)
    const out = data(r)
    expect(out.proposalId).toBe('prop-1')
    expect(out.resolved).toMatchObject({ clientId: 'cl1', clientName: 'Acme', content: 'Hello world', status: 'draft', platforms: ['facebook'] })
    expect(d.propose).toHaveBeenCalledTimes(1)
    // the executor (not the tool) is what eventually posts — the tool only persisted a proposal
  })

  it('marks status "scheduled" when a scheduledAt is given', async () => {
    const r = await proposeScheduleSocialPost({ clientName: 'Acme', content: 'Launch', scheduledAt: '2026-07-01T09:00:00Z' }, ctx(), deps())
    expect(data(r).resolved).toMatchObject({ status: 'scheduled', scheduledAt: '2026-07-01T09:00:00Z' })
  })

  it('rejects planned platforms before creating a proposal', async () => {
    const d = deps()
    const result = await proposeScheduleSocialPost({
      clientName: 'Acme',
      content: 'Launch',
      platforms: ['facebook', 'youtube']
    }, ctx(), d)

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('YouTube publishing is not production-ready')
    })
    expect(d.propose).not.toHaveBeenCalled()
  })

  it('returns a disambiguation (no proposal) when several clients match', async () => {
    const d = deps({ findClients: vi.fn().mockResolvedValue([{ id: 'a', name: 'Acme AU' }, { id: 'b', name: 'Acme NZ' }]) })
    const out = data(await proposeScheduleSocialPost({ clientName: 'Acme', content: 'x' }, ctx(), d))
    expect(out.disambiguation?.field).toBe('clientName')
    expect(d.propose).not.toHaveBeenCalled()
  })

  it('honors an exact client-name match even amid substring matches', async () => {
    const d = deps({ findClients: vi.fn().mockResolvedValue([{ id: 'a', name: 'Acme' }, { id: 'b', name: 'Acme Holdings' }]) })
    const out = data(await proposeScheduleSocialPost({ clientName: 'Acme', content: 'x' }, ctx(), d))
    expect(out.resolved?.clientId).toBe('a')
  })

  it('fails when no client matches', async () => {
    const d = deps({ findClients: vi.fn().mockResolvedValue([]) })
    expect((await proposeScheduleSocialPost({ clientName: 'Nope', content: 'x' }, ctx(), d)).ok).toBe(false)
    expect(d.propose).not.toHaveBeenCalled()
  })

  it('rejects a read-only role and empty content without proposing', async () => {
    const d = deps()
    expect((await proposeScheduleSocialPost({ clientName: 'Acme', content: 'x' }, ctx('viewer'), d)).ok).toBe(false)
    expect((await proposeScheduleSocialPost({ clientName: 'Acme', content: '   ' }, ctx(), d)).ok).toBe(false)
    expect(d.propose).not.toHaveBeenCalled()
  })

  it('is a CREATIVE-gated mutating (propose-only) tool', () => {
    expect(scheduleSocialPostTool.mutates).toBe(true)
    expect(scheduleSocialPostTool.requiredPermission).toBe('CREATIVE')
    expect(registry.find(t => t.name === 'propose_schedule_post')).toBeDefined()
  })
})

describe('proposalToSocialPostBody', () => {
  it('maps a resolved proposal to the publishing endpoint body (drops empty optionals)', () => {
    const body = proposalToSocialPostBody({
      clientId: 'cl1', content: 'Hi', platforms: ['instagram'], scheduledAt: '2026-07-01T09:00:00Z',
      status: 'scheduled', linkUrl: null, firstComment: null
    })
    expect(body).toMatchObject({ clientId: 'cl1', content: 'Hi', platforms: ['instagram'], scheduledAt: '2026-07-01T09:00:00Z', status: 'scheduled' })
    expect(body.linkUrl).toBeUndefined()
  })
})
