import { describe, expect, it } from 'vitest'
import {
  CRM_SEARCH_MODE_ORDER,
  CRM_SEARCH_SURFACE_CEILINGS,
  isCrmSearchProviderActionAllowed,
  resolveEffectiveCrmSearchMode,
  resolvePolicyStateMode
} from '~~/server/utils/crm/searchIndex/policy'

describe('CRM search effective policy', () => {
  it('pins the restrictive mode ordering and code-owned surface ceilings', () => {
    expect(CRM_SEARCH_MODE_ORDER).toEqual({ off: 0, shadow: 1, assist: 2 })
    expect(CRM_SEARCH_SURFACE_CEILINGS).toEqual({
      portal_global: 'off',
      agency_global: 'shadow',
      agency_ai: 'assist'
    })
  })

  it('chooses the most restrictive global maximum, client policy, and surface ceiling', () => {
    expect(resolveEffectiveCrmSearchMode({
      globalState: 'enabled',
      globalMaximum: 'shadow',
      policyMode: 'assist',
      surface: 'agency_ai',
      infrastructureReady: true
    })).toBe('shadow')

    expect(resolveEffectiveCrmSearchMode({
      globalState: 'enabled',
      globalMaximum: 'assist',
      policyMode: 'assist',
      surface: 'agency_global',
      infrastructureReady: true
    })).toBe('shadow')

    expect(resolveEffectiveCrmSearchMode({
      globalState: 'enabled',
      globalMaximum: 'assist',
      policyMode: 'assist',
      surface: 'portal_global',
      infrastructureReady: true
    })).toBe('off')
  })

  it.each([
    ['halted global control', { globalState: 'halted' }],
    ['delete-only global control', { globalState: 'delete_only' }],
    ['unready infrastructure', { infrastructureReady: false }],
    ['unknown global state', { globalState: 'mystery' }],
    ['unknown maximum', { globalMaximum: 'mystery' }],
    ['unknown policy mode', { policyMode: 'mystery' }],
    ['unknown surface', { surface: 'mystery' }]
  ])('fails closed for %s', (_case, override) => {
    expect(resolveEffectiveCrmSearchMode({
      globalState: 'enabled',
      globalMaximum: 'assist',
      policyMode: 'assist',
      surface: 'agency_ai',
      infrastructureReady: true,
      ...override
    } as never)).toBe('off')
  })

  it('maps lifecycle states to their only legal query modes and treats malformed state as off', () => {
    expect(resolvePolicyStateMode('off')).toBe('off')
    expect(resolvePolicyStateMode('indexing')).toBe('off')
    expect(resolvePolicyStateMode('shadow')).toBe('shadow')
    expect(resolvePolicyStateMode('assist')).toBe('assist')
    expect(resolvePolicyStateMode('teardown_pending')).toBe('off')
    expect(resolvePolicyStateMode('unexpected')).toBe('off')
    expect(resolvePolicyStateMode(undefined)).toBe('off')
  })

  it('admits provider mutations only for the global state, policy state, action, and schema role intersection', () => {
    expect(isCrmSearchProviderActionAllowed({
      globalState: 'enabled',
      policyState: 'indexing',
      action: 'upsert',
      schemaRole: 'active',
      infrastructureReady: true,
      teardownAuthorized: false
    })).toBe(true)
    expect(isCrmSearchProviderActionAllowed({
      globalState: 'enabled',
      policyState: 'shadow',
      action: 'upsert',
      schemaRole: 'candidate',
      infrastructureReady: true,
      teardownAuthorized: false
    })).toBe(true)
    expect(isCrmSearchProviderActionAllowed({
      globalState: 'enabled',
      policyState: 'assist',
      action: 'upsert',
      schemaRole: 'retiring',
      infrastructureReady: true,
      teardownAuthorized: false
    })).toBe(false)
    expect(isCrmSearchProviderActionAllowed({
      globalState: 'delete_only',
      policyState: 'teardown_pending',
      action: 'delete',
      schemaRole: 'retiring',
      infrastructureReady: true,
      teardownAuthorized: true
    })).toBe(true)
    expect(isCrmSearchProviderActionAllowed({
      globalState: 'delete_only',
      policyState: 'teardown_pending',
      action: 'upsert',
      schemaRole: 'active',
      infrastructureReady: true,
      teardownAuthorized: true
    })).toBe(false)
  })

  it('allows durable teardown authorization to survive deletion of the ordinary client policy row', () => {
    expect(isCrmSearchProviderActionAllowed({
      globalState: 'delete_only',
      policyState: undefined,
      action: 'delete',
      schemaRole: 'retiring',
      infrastructureReady: true,
      teardownAuthorized: true
    })).toBe(true)
    expect(isCrmSearchProviderActionAllowed({
      globalState: 'enabled',
      policyState: undefined,
      action: 'delete',
      schemaRole: 'active',
      infrastructureReady: true,
      teardownAuthorized: true
    })).toBe(true)
    expect(isCrmSearchProviderActionAllowed({
      globalState: 'delete_only',
      policyState: 'teardown_pending',
      action: 'delete',
      schemaRole: 'retiring',
      infrastructureReady: true,
      teardownAuthorized: false
    })).toBe(false)
    expect(isCrmSearchProviderActionAllowed({
      globalState: 'enabled',
      policyState: 'teardown_pending',
      action: 'delete',
      schemaRole: 'retiring',
      infrastructureReady: true,
      teardownAuthorized: false
    })).toBe(false)
  })

  it('fails provider admission closed on any unknown or missing input', () => {
    const valid = {
      globalState: 'enabled',
      policyState: 'indexing',
      action: 'upsert',
      schemaRole: 'active',
      infrastructureReady: true,
      teardownAuthorized: false
    } as const

    expect(isCrmSearchProviderActionAllowed({ ...valid, action: 'replace' } as never)).toBe(false)
    expect(isCrmSearchProviderActionAllowed({ ...valid, schemaRole: 'legacy' } as never)).toBe(false)
    expect(isCrmSearchProviderActionAllowed({ ...valid, policyState: 'unknown' } as never)).toBe(false)
    expect(isCrmSearchProviderActionAllowed({ ...valid, infrastructureReady: undefined } as never)).toBe(false)
    expect(isCrmSearchProviderActionAllowed({ ...valid, teardownAuthorized: 'yes' } as never)).toBe(false)
  })
})
