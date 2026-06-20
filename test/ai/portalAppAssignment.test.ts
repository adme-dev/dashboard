import { describe, it, expect } from 'vitest'
import { PORTAL_APP_TOOLS, narrowPortalRegistryByApps, getEnabledPortalApps } from '~~/server/utils/ai/portalTools/appAssignment'
import { portalRegistry } from '~~/server/utils/ai/portalTools'
import type { PortalAiTool } from '~~/server/utils/ai/portalTools/portalContext'

describe('portal app-assignment (config narrows, never grants)', () => {
  it('null enabledApps → the full portal registry (default-all)', () => {
    expect(narrowPortalRegistryByApps(portalRegistry, null)).toBe(portalRegistry)
  })

  it('an empty allowlist → no tools', () => {
    expect(narrowPortalRegistryByApps(portalRegistry, [])).toEqual([])
  })

  it('restricts to exactly the tools unlocked by the enabled apps', () => {
    const tools = narrowPortalRegistryByApps(portalRegistry, ['approvals', 'invoices'])
    expect(tools.map(t => t.name).sort()).toEqual(['get_my_approvals', 'get_my_invoices'])
  })

  it('unknown app keys contribute nothing (cannot grant)', () => {
    const tools = narrowPortalRegistryByApps(portalRegistry, ['approvals', 'made-up-app', 'get_finance_snapshot'])
    expect(tools.map(t => t.name)).toEqual(['get_my_approvals'])
  })

  it('every mapped tool actually exists in the registry (no dangling map entry)', () => {
    const registryNames = new Set(portalRegistry.map(t => t.name))
    for (const names of Object.values(PORTAL_APP_TOOLS)) {
      for (const n of names) expect(registryNames.has(n)).toBe(true)
    }
  })

  it('the assignment can only ever subtract from the portal-safe set', () => {
    const all = new Set(portalRegistry.map(t => t.name))
    const anyApps = ['approvals', 'projects', 'invoices', 'leads', 'briefs', 'social-reporting', 'bogus']
    for (const t of narrowPortalRegistryByApps(portalRegistry as PortalAiTool<any>[], anyApps)) {
      expect(all.has(t.name)).toBe(true) // never introduces a non-portal tool
    }
  })
})

describe('getEnabledPortalApps', () => {
  const dbReturning = (v: unknown) => ({ queryOne: async () => ({ portal_ai_apps: v }) })

  it('returns null when the column is unset (→ default-all)', async () => {
    expect(await getEnabledPortalApps('c1', dbReturning(null))).toBeNull()
    expect(await getEnabledPortalApps('c1', { queryOne: async () => null })).toBeNull()
  })

  it('returns the stored string array', async () => {
    expect(await getEnabledPortalApps('c1', dbReturning(['approvals', 'invoices']))).toEqual(['approvals', 'invoices'])
  })

  it('filters out non-string entries', async () => {
    expect(await getEnabledPortalApps('c1', dbReturning(['approvals', 3, null, 'leads']))).toEqual(['approvals', 'leads'])
  })

  it('fail-safe: a db error → null (default-all, never throws)', async () => {
    expect(await getEnabledPortalApps('c1', { queryOne: async () => { throw new Error('db down') } })).toBeNull()
  })
})
