import { describe, it, expect, vi } from 'vitest'
import { proposeCreateTask, pickByExactName, type CreateTaskDeps } from '~~/server/utils/ai/tools/createTask'

const ctx = (over: Partial<{ userRole: string, conversationId?: string }> = {}) => ({
  userId: 'u1', userRole: over.userRole ?? 'account_manager',
  conversationId: 'conversationId' in over ? over.conversationId : 'c1',
  event: {} as any,
})

const mkDeps = (over: Partial<CreateTaskDeps> = {}): CreateTaskDeps => ({
  resolveDepartment: vi.fn().mockResolvedValue([{ id: 'd1', name: 'Creative' }]),
  resolveWorkspaceBoards: vi.fn().mockResolvedValue([]),
  resolveProject: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Acme Rebrand' }]),
  resolveAssignee: vi.fn().mockResolvedValue([{ id: 'm1', name: 'Sam' }]),
  propose: vi.fn().mockResolvedValue('prop-1'),
  ...over,
})

describe('proposeCreateTask (Option B — propose only)', () => {
  it('resolves names→ids, persists a proposal, and returns it WITHOUT creating a task', async () => {
    const deps = mkDeps()
    const res = await proposeCreateTask(
      { title: 'Follow up with Acme', boardName: 'Creative', projectName: 'Acme', assigneeName: 'Sam', dueDate: '2026-06-10' },
      ctx() as any, deps,
    )
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.proposalId).toBe('prop-1')
    expect(data.resolved.departmentId).toBe('d1')
    expect(data.resolved.projectId).toBe('p1')
    expect(data.resolved.assigneeId).toBe('m1')
    expect(data.resolved.title).toBe('Follow up with Acme')
    expect(deps.propose).toHaveBeenCalledTimes(1)
  })

  it('blocks read-only roles (no proposal persisted)', async () => {
    const deps = mkDeps()
    const res = await proposeCreateTask({ title: 'X', boardName: 'Creative' }, ctx({ userRole: 'viewer' }) as any, deps)
    expect(res.ok).toBe(false)
    expect(deps.propose).not.toHaveBeenCalled()
  })

  it('asks for a board when none is given (cannot create without a department)', async () => {
    const deps = mkDeps()
    const res = await proposeCreateTask({ title: 'X' }, ctx() as any, deps)
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/board|department/i)
    expect(deps.propose).not.toHaveBeenCalled()
  })

  it('returns a disambiguation list when the board partially matches multiple (no exact match, no proposal)', async () => {
    const deps = mkDeps({ resolveDepartment: vi.fn().mockResolvedValue([{ id: 'd1', name: 'Creative' }, { id: 'd2', name: 'Creative Ops' }]) })
    const res = await proposeCreateTask({ title: 'X', boardName: 'Creat' }, ctx() as any, deps)
    expect(res.ok).toBe(true)
    expect((res as any).data.disambiguation.field).toBe('boardName')
    expect((res as any).data.disambiguation.options).toHaveLength(2)
    expect(deps.propose).not.toHaveBeenCalled()
  })

  it('proposes cleanly when the board name EXACTLY matches one, even among broader substring matches', async () => {
    // "ADME Creative Request" exactly names one board though many "ADME …" boards also match.
    const deps = mkDeps({
      resolveDepartment: vi.fn().mockResolvedValue([
        { id: 'd1', name: 'ADME Creative Request' },
        { id: 'd2', name: 'ADME Creative Request Archive' },
        { id: 'd3', name: 'ADME Creative Requests 2024' },
      ]),
    })
    const res = await proposeCreateTask({ title: 'Design a banner', boardName: 'adme creative request' }, ctx() as any, deps)
    expect(res.ok).toBe(true)
    expect((res as any).data.proposalId).toBe('prop-1')
    expect((res as any).data.resolved.departmentId).toBe('d1')
    expect((res as any).data.resolved.departmentName).toBe('ADME Creative Request')
    expect(deps.propose).toHaveBeenCalledTimes(1)
  })

  it('treats a workspace name as a board container — lists that workspace\'s boards (no dead-end)', async () => {
    // "Main" is a workspace, not a board → 0 board matches, but the workspace has boards to choose from.
    const deps = mkDeps({
      resolveDepartment: vi.fn().mockResolvedValue([]),
      resolveWorkspaceBoards: vi.fn().mockResolvedValue([{ id: 'b1', name: 'Main Tasks' }, { id: 'b2', name: 'Main Calendar' }]),
    })
    const res = await proposeCreateTask({ title: 'X', boardName: 'Main' }, ctx() as any, deps)
    expect(res.ok).toBe(true)
    const d = (res as any).data.disambiguation
    expect(d.field).toBe('boardName')
    expect(d.options.map((o: any) => o.name)).toEqual(['Main Tasks', 'Main Calendar'])
    expect(d.note).toMatch(/workspace/i)
    expect(deps.propose).not.toHaveBeenCalled()
  })

  it('prefers a workspace match over random substring board matches', async () => {
    // "Marketing" substring-matches some boards but is also a workspace — surface the workspace's boards.
    const deps = mkDeps({
      resolveDepartment: vi.fn().mockResolvedValue([{ id: 'x1', name: 'Email Marketing' }, { id: 'x2', name: 'Marketing Calendar' }]),
      resolveWorkspaceBoards: vi.fn().mockResolvedValue([{ id: 'w1', name: 'Campaigns' }, { id: 'w2', name: 'Social' }]),
    })
    const res = await proposeCreateTask({ title: 'X', boardName: 'Marketing' }, ctx() as any, deps)
    expect(res.ok).toBe(true)
    expect((res as any).data.disambiguation.options.map((o: any) => o.name)).toEqual(['Campaigns', 'Social'])
    expect((res as any).data.disambiguation.note).toMatch(/workspace/i)
  })

  it('fails clearly when the name is neither a board nor a workspace', async () => {
    const deps = mkDeps({ resolveDepartment: vi.fn().mockResolvedValue([]), resolveWorkspaceBoards: vi.fn().mockResolvedValue([]) })
    const res = await proposeCreateTask({ title: 'X', boardName: 'Nonexistent' }, ctx() as any, deps)
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/no board or workspace/i)
    expect(deps.propose).not.toHaveBeenCalled()
  })

  it('refuses to prepare a task outside a conversation', async () => {
    const deps = mkDeps()
    const res = await proposeCreateTask({ title: 'X', boardName: 'Creative' }, ctx({ conversationId: undefined }) as any, deps)
    expect(res.ok).toBe(false)
    expect(deps.propose).not.toHaveBeenCalled()
  })
})

describe('pickByExactName', () => {
  const opts = [{ name: 'Creative' }, { name: 'Creative Ops' }, { name: 'creative' }]

  it('collapses to the single exact (case-insensitive) match among substring matches', () => {
    expect(pickByExactName([{ name: 'ADME' }, { name: 'ADME Creative' }, { name: 'ADME Promo' }], 'adme')).toEqual([{ name: 'ADME' }])
    expect(pickByExactName([{ name: 'Creative' }, { name: 'Creative Ops' }], 'CREATIVE')).toEqual([{ name: 'Creative' }])
  })

  it('returns all candidates when there is no exact match', () => {
    const cands = [{ name: 'Creative' }, { name: 'Creative Ops' }]
    expect(pickByExactName(cands, 'Creat')).toBe(cands)
  })

  it('returns all candidates when more than one exact match exists (genuinely ambiguous)', () => {
    expect(pickByExactName(opts, 'creative')).toBe(opts) // 'Creative' and 'creative' both match
  })

  it('trims whitespace on both sides before comparing', () => {
    expect(pickByExactName([{ name: ' Creative ' }, { name: 'Creative Ops' }], 'creative')).toEqual([{ name: ' Creative ' }])
  })
})
