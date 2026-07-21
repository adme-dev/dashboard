import { describe, expect, it, vi } from 'vitest'
import { fetchScopedMentionedEntities } from '~~/server/utils/ai/mentionedEntityContext'
import type { MentionedEntityContextDb } from '~~/server/utils/ai/mentionedEntityContext'
import type { PersonalAssistantContext } from '~~/server/utils/ai/personalAssistantContext'

const DEPARTMENT_ID = '10000000-0000-4000-8000-000000000001'
const CLIENT_ID = '60000000-0000-4000-8000-000000000001'

function context(mode: 'assigned' | 'all_active' = 'assigned'): PersonalAssistantContext {
  return {
    identity: { userId: '50000000-0000-4000-8000-000000000001', role: 'creative' },
    permissionGroups: ['CREATIVE'],
    isReadOnly: false,
    departments: [{
      departmentId: DEPARTMENT_ID,
      name: 'Creative',
      slug: 'creative',
      kind: 'organizational',
      membershipRole: 'member',
      isPrimary: true,
      isManager: false,
      accessReason: 'membership',
      escalationManager: null
    }],
    clientScope: {
      mode,
      assignments: [{ clientId: CLIENT_ID, name: 'Example Client', role: 'support' }]
    },
    preferences: { personaKey: null, disabledTools: [], memoryEnabled: true },
    activePacks: [],
    catalogInstructionsPreamble: '',
    catalogRows: []
  }
}

describe('fetchScopedMentionedEntities', () => {
  it('applies department and assigned-client authority to every supported entity lookup', async () => {
    const queryOne = vi.fn().mockResolvedValue(null)
    const db: MentionedEntityContextDb = { queryOne }

    await fetchScopedMentionedEntities([
      { type: 'task', id: 'task-1' },
      { type: 'client', id: 'client-1' },
      { type: 'project', id: 'project-1' },
      { type: 'brief', id: 'brief-1' }
    ], context(), db)

    expect(queryOne).toHaveBeenCalledTimes(4)
    expect(queryOne.mock.calls[0]?.[0]).toContain('t.department_id = ANY($2::uuid[])')
    expect(queryOne.mock.calls[0]?.[1]).toEqual(['task-1', [DEPARTMENT_ID]])
    for (const call of queryOne.mock.calls.slice(1)) {
      expect(call[0]).toContain('is_active = TRUE')
      expect(call[0]).toContain('ANY($2::uuid[])')
      expect(call[1]?.[1]).toEqual([CLIENT_ID])
    }
  })

  it('uses active-company client scope for management without materializing an allowlist predicate', async () => {
    const queryOne = vi.fn().mockResolvedValue(null)

    await fetchScopedMentionedEntities([
      { type: 'client', id: 'client-1' },
      { type: 'project', id: 'project-1' },
      { type: 'brief', id: 'brief-1' }
    ], context('all_active'), { queryOne })

    for (const call of queryOne.mock.calls) {
      expect(call[0]).toContain('is_active = TRUE')
      expect(call[0]).not.toContain('ANY($2::uuid[])')
      expect(call[1]).toEqual([expect.any(String)])
    }
  })

  it('does not query unauthorized empty department or client scopes', async () => {
    const queryOne = vi.fn().mockResolvedValue(null)
    const empty = context()
    empty.departments = []
    empty.clientScope.assignments = []

    const result = await fetchScopedMentionedEntities([
      { type: 'task', id: 'task-1' },
      { type: 'client', id: 'client-1' },
      { type: 'project', id: 'project-1' },
      { type: 'brief', id: 'brief-1' }
    ], empty, { queryOne })

    expect(result).toEqual([])
    expect(queryOne).not.toHaveBeenCalled()
  })
})
