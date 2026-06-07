import { describe, it, expect } from 'vitest'
import { PERSONAS, DEFAULT_PERSONA, PERSONA_OPTIONS, resolvePersona } from '~~/server/utils/ai/personas'
import { registry } from '~~/server/utils/ai/tools/index'
import { filterToolsForUser } from '~~/server/utils/ai/toolRegistry'
import { AI_PERSONA_OPTIONS } from '~~/app/utils/aiPersonas'

const REGISTRY_NAMES = new Set(registry.map(t => t.name))

describe('resolvePersona', () => {
  it('resolves a known key to its persona', () => {
    expect(resolvePersona('finance')).toBe(PERSONAS.finance)
    expect(resolvePersona('marketing')).toBe(PERSONAS.marketing)
  })

  it('falls back to the generalist for unknown / empty / nullish keys', () => {
    expect(resolvePersona('does-not-exist')).toBe(DEFAULT_PERSONA)
    expect(resolvePersona('')).toBe(DEFAULT_PERSONA)
    expect(resolvePersona(null)).toBe(DEFAULT_PERSONA)
    expect(resolvePersona(undefined)).toBe(DEFAULT_PERSONA)
  })
})

describe('persona definitions', () => {
  it('every allowlisted tool name exists in the registry (typo guard)', () => {
    for (const p of Object.values(PERSONAS)) {
      for (const name of p.toolAllowlist ?? []) {
        expect(REGISTRY_NAMES.has(name), `${p.key} allowlists unknown tool "${name}"`).toBe(true)
      }
    }
  })

  it('the generalist has no allowlist (all RBAC-permitted tools)', () => {
    expect(DEFAULT_PERSONA.toolAllowlist).toBeUndefined()
  })

  it('every focused persona can still propose tasks and search the KB', () => {
    for (const p of Object.values(PERSONAS)) {
      if (!p.toolAllowlist) continue
      expect(p.toolAllowlist).toContain('create_task')
      expect(p.toolAllowlist).toContain('search_knowledge')
    }
  })

  it('PERSONA_OPTIONS lists every persona with the generalist first', () => {
    expect(PERSONA_OPTIONS[0].key).toBe('general')
    expect(PERSONA_OPTIONS.map(o => o.key).sort()).toEqual(Object.keys(PERSONAS).sort())
  })

  it('the client picker list (app/utils/aiPersonas) stays in sync with the server personas', () => {
    // Key + label parity guards against the mirrored client list drifting from the server source.
    expect(AI_PERSONA_OPTIONS.map(o => o.key).sort()).toEqual(Object.keys(PERSONAS).sort())
    for (const o of AI_PERSONA_OPTIONS) {
      expect(PERSONAS[o.key]!.label).toBe(o.label)
    }
  })
})

describe('Finance persona slice-2 tools', () => {
  it('the Finance persona includes the Slice-2 margin & forecasting tools', () => {
    const allow = PERSONAS.finance!.toolAllowlist ?? []
    for (const n of ['get_client_profitability', 'monitor_retainer_burn', 'flag_over_servicing', 'forecast_revenue']) {
      expect(allow).toContain(n)
    }
  })
})

describe('persona narrowing is bounded by RBAC (never grants beyond the role)', () => {
  // Replicates the loop's two-step: RBAC filter THEN persona allowlist intersection.
  function toolsFor(role: string, personaKey: string): string[] {
    const persona = resolvePersona(personaKey)
    let tools = filterToolsForUser(registry, role)
    if (persona.toolAllowlist) tools = tools.filter(t => persona.toolAllowlist!.includes(t.name))
    return tools.map(t => t.name)
  }

  it('owner + finance persona → exactly the finance allowlist (all permitted)', () => {
    expect(toolsFor('owner', 'finance').sort()).toEqual([...PERSONAS.finance!.toolAllowlist!].sort())
  })

  it('a non-FINANCE role + finance persona still cannot reach get_finance_snapshot', () => {
    // 'creative' lacks FINANCE → the finance tool is dropped by RBAC before the persona even applies.
    expect(toolsFor('creative', 'finance')).not.toContain('get_finance_snapshot')
  })
})
