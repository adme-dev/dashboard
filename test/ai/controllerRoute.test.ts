import { describe, it, expect, vi } from 'vitest'
import { selectSkillPack, type RouteDeps } from '~~/server/utils/ai/controller/route'
import { SKILL_PACKS, packForIntent } from '~~/server/utils/ai/controller/registry'
import { PERSONAS } from '~~/server/utils/ai/personas'
import { roleHasPermission } from '~~/server/utils/permissions'

// Real RBAC + role-default by default; override per test.
const deps = (over: Partial<RouteDeps> = {}): RouteDeps => ({
  hasPermission: roleHasPermission,
  roleDefault: (role: string) => (role === 'media_buyer' ? 'media_buyer' : role === 'finance' ? 'finance' : undefined),
  ...over,
})

describe('selectSkillPack (L1 routing)', () => {
  it('an explicit/persisted pick always wins (and is reported as explicit)', () => {
    expect(selectSkillPack({ intent: 'financial_query', userRole: 'owner' }, 'sales', deps()))
      .toEqual({ persona: 'sales', reason: 'explicit' })
  })

  it('routes a financial question to the Finance pack for an entitled role', () => {
    expect(selectSkillPack({ intent: 'financial_query', userRole: 'owner' }, null, deps()))
      .toEqual({ persona: 'finance', reason: 'intent' })
  })

  it('does NOT route to a pack the role cannot use — falls back to role-default', () => {
    // media_buyer lacks FINANCE, so a financial_query cannot route to the finance pack.
    expect(selectSkillPack({ intent: 'financial_query', userRole: 'media_buyer' }, null, deps()))
      .toEqual({ persona: 'media_buyer', reason: 'role-default' })
  })

  it('routes task/project/team questions to the Account pack', () => {
    for (const intent of ['task_query', 'project_query', 'brief_query', 'team_query'] as const) {
      expect(selectSkillPack({ intent, userRole: 'owner' }, null, deps()).persona).toBe('account')
    }
  })

  it('routes a pricing question to Sales', () => {
    expect(selectSkillPack({ intent: 'pricing_query', userRole: 'owner' }, null, deps()).persona).toBe('sales')
  })

  it('falls back to the generalist when no intent match and no role default', () => {
    expect(selectSkillPack({ intent: 'general', userRole: 'developer' }, null, deps()))
      .toEqual({ persona: 'general', reason: 'generalist' })
  })

  it('uses the role default when the intent has no mapped pack', () => {
    // a media_buyer asking something generic stays on their pack
    expect(selectSkillPack({ intent: 'general', userRole: 'media_buyer' }, null, deps()))
      .toEqual({ persona: 'media_buyer', reason: 'role-default' })
  })

  it('never routes to an unentitled pack across the whole registry (RBAC ceiling)', () => {
    // A role with NO permissions must never be routed anywhere but the generalist by intent.
    const noPerms = deps({ hasPermission: () => false, roleDefault: () => undefined })
    for (const p of SKILL_PACKS) {
      for (const intent of p.intents) {
        expect(selectSkillPack({ intent, userRole: 'viewer' }, null, noPerms).persona).toBe('general')
      }
    }
  })
})

describe('SKILL_PACKS registry integrity', () => {
  it('every pack persona is a real persona', () => {
    for (const p of SKILL_PACKS) {
      expect(PERSONAS[p.persona], `unknown persona "${p.persona}"`).toBeDefined()
    }
  })

  it('packForIntent returns null for an unmapped/empty intent', () => {
    expect(packForIntent(null, () => true)).toBeNull()
    expect(packForIntent('code_query', () => true)).toBeNull()
  })
})
