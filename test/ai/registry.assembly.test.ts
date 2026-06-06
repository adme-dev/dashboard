import { describe, it, expect } from 'vitest'
import { registry } from '~~/server/utils/ai/tools/index'
import { filterToolsForUser } from '~~/server/utils/ai/toolRegistry'

const EXPECTED = [
  'get_finance_snapshot', 'get_adspend_pacing', 'get_tasks', 'get_project_status',
  'get_open_anomalies', 'get_client_overview', 'search_knowledge',
  'get_social_performance', 'get_briefs',
]

describe('assembled tool registry (Slice 1 read tools)', () => {
  it('contains exactly the 9 read tools by name', () => {
    expect(registry.map(t => t.name).sort()).toEqual([...EXPECTED].sort())
  })

  it('every tool has a description and a Zod parameters schema', () => {
    for (const t of registry) {
      expect(typeof t.description).toBe('string')
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.parameters).toBeTruthy()
    }
  })

  it('no read tool is marked mutating', () => {
    expect(registry.every(t => !t.mutates)).toBe(true)
  })

  it('RBAC filter hides FINANCE/CLIENTS tools from a low-privilege role', () => {
    const creative = filterToolsForUser(registry, 'creative').map(t => t.name)
    expect(creative).not.toContain('get_finance_snapshot') // FINANCE
    expect(creative).not.toContain('get_adspend_pacing')   // FINANCE
    expect(creative).not.toContain('get_client_overview')  // CLIENTS
    expect(creative).toContain('get_tasks')                // any authed
    expect(creative).toContain('get_briefs')               // any authed
  })

  it('owner sees all 9', () => {
    expect(filterToolsForUser(registry, 'owner')).toHaveLength(9)
  })
})
