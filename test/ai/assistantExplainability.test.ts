import { describe, expect, it } from 'vitest'
import {
  buildMyAssistantExplainability,
  type ExplainableAssistantTool
} from '~~/server/utils/ai/assistantExplainability'
import type { PersonalAssistantContext } from '~~/server/utils/ai/personalAssistantContext'

const context: PersonalAssistantContext = {
  identity: {
    userId: '50000000-0000-4000-8000-000000000001',
    role: 'creative'
  },
  permissionGroups: ['CREATIVE'],
  isReadOnly: true,
  departments: [{
    departmentId: '10000000-0000-4000-8000-000000000001',
    name: 'Creative',
    slug: 'creative',
    kind: 'organizational',
    membershipRole: 'senior',
    isPrimary: true,
    isManager: false,
    accessReason: 'membership',
    escalationManager: {
      userId: '70000000-0000-4000-8000-000000000001',
      name: 'Creative Lead'
    }
  }],
  clientScope: {
    mode: 'assigned',
    assignments: [{
      clientId: '60000000-0000-4000-8000-000000000001',
      name: 'Example Client',
      role: 'support'
    }]
  },
  preferences: {
    personaKey: 'marketing',
    disabledTools: ['search_knowledge'],
    memoryEnabled: false
  },
  activePacks: [{
    releaseId: '20000000-0000-4000-8000-000000000001',
    departmentId: '10000000-0000-4000-8000-000000000001',
    packVersionId: '30000000-0000-4000-8000-000000000001',
    packKey: 'creative_studio',
    version: 3,
    label: 'Creative Studio',
    releaseState: 'pilot'
  }],
  catalogInstructionsPreamble: 'PRIVATE GOVERNANCE INSTRUCTIONS',
  catalogRows: []
}

const tools: ExplainableAssistantTool[] = [
  {
    name: 'search_knowledge',
    description: 'Search approved agency knowledge.',
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'create_task',
    description: 'Prepare a task proposal.',
    mutates: true,
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'get_finance_snapshot',
    description: 'Read finance data.',
    requiredPermission: 'FINANCE'
  }
]

describe('buildMyAssistantExplainability', () => {
  it('returns minimal human-readable authority without internal identity or prompt material', () => {
    const view = buildMyAssistantExplainability(context, tools)

    expect(view).toMatchObject({
      personaKey: 'marketing',
      disabledTools: ['search_knowledge'],
      memoryEnabled: false,
      authority: {
        currentRole: 'creative',
        readOnly: true,
        permissionGroups: ['CREATIVE'],
        departments: [{
          name: 'Creative',
          membershipRole: 'senior',
          primary: true,
          escalationManagerName: 'Creative Lead'
        }],
        clientScope: {
          mode: 'assigned',
          assignments: [{ name: 'Example Client', role: 'support' }]
        },
        activePacks: [{
          key: 'creative_studio',
          label: 'Creative Studio',
          version: 3,
          departmentName: 'Creative',
          releaseState: 'pilot'
        }]
      }
    })

    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain(context.identity.userId)
    expect(serialized).not.toContain(context.departments[0]!.departmentId)
    expect(serialized).not.toContain(context.clientScope.assignments[0]!.clientId)
    expect(serialized).not.toContain('PRIVATE GOVERNANCE INSTRUCTIONS')
  })

  it('uses current permission, read-only, focus, and personal settings as narrowing layers', () => {
    const view = buildMyAssistantExplainability(context, tools)

    expect(view.tools).toEqual([{
      name: 'search_knowledge',
      description: 'Search approved agency knowledge.',
      mutates: false,
      personallyEnabled: false,
      availableInCurrentFocus: false,
      currentFocusReason: 'personal_disabled'
    }])
    expect(view.restrictions).toEqual(expect.arrayContaining([
      expect.objectContaining({ toolName: 'create_task', reason: 'read_only' }),
      expect.objectContaining({ toolName: 'search_knowledge', reason: 'personal_disabled' })
    ]))
    expect(view.restrictions.every(item => item.message.length > 20)).toBe(true)
    expect(JSON.stringify(view)).not.toContain('get_finance_snapshot')
  })

  it('omits assignment details when company policy already grants all-client scope', () => {
    const view = buildMyAssistantExplainability({
      ...context,
      clientScope: { ...context.clientScope, mode: 'all_active' }
    }, tools)

    expect(view.authority.clientScope).toEqual({ mode: 'all_active', assignments: [] })
    expect(JSON.stringify(view)).not.toContain('Example Client')
  })
})
