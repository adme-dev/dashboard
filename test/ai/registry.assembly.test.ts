import { describe, it, expect } from 'vitest'
import { registry } from '~~/server/utils/ai/tools/index'
import { filterToolsForUser } from '~~/server/utils/ai/toolRegistry'

const READ_TOOLS = [
  'get_finance_snapshot', 'get_adspend_pacing', 'get_tasks', 'get_project_status',
  'get_open_anomalies', 'get_client_overview', 'search_knowledge',
  'get_social_performance', 'get_briefs',
]
const SLICE2_TOOLS = [
  'get_client_profitability', 'monitor_retainer_burn', 'flag_over_servicing', 'forecast_revenue',
]
// Phase-1 media-buyer read skill-pack (MEDIA_BUYING-gated).
const MEDIA_BUYER_TOOLS = ['get_campaign_breakdown', 'get_budget_health']
// Phase-2/3 write tools (propose→confirm→audit).
const WRITE_TOOLS = ['create_task', 'propose_schedule_post', 'propose_budget_alert', 'propose_budget_change', 'propose_knowledge_article']
// remember = personal-memory capture (non-mutating; available to every authed role).
const ALL = [...READ_TOOLS, ...SLICE2_TOOLS, ...MEDIA_BUYER_TOOLS, ...WRITE_TOOLS, 'remember']

describe('assembled tool registry (Slices 1–2 + memory + media-buyer + Phase-2 writes)', () => {
  it('contains the 15 read tools + the write tools + remember', () => {
    expect(registry.map(t => t.name).sort()).toEqual([...ALL].sort())
  })

  it('every tool has a description and a Zod parameters schema', () => {
    for (const t of registry) {
      expect(typeof t.description).toBe('string')
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.parameters).toBeTruthy()
    }
  })

  it('the mutating tools are exactly the propose→confirm writes', () => {
    expect(registry.filter(t => t.mutates).map(t => t.name).sort()).toEqual(['create_task', 'propose_budget_alert', 'propose_budget_change', 'propose_knowledge_article', 'propose_schedule_post'])
  })

  it('RBAC filter hides FINANCE/CLIENTS tools from a low-privilege role but keeps create_task', () => {
    const creative = filterToolsForUser(registry, 'creative').map(t => t.name)
    expect(creative).not.toContain('get_finance_snapshot') // FINANCE
    expect(creative).not.toContain('get_client_overview')  // CLIENTS
    expect(creative).toContain('get_tasks')                // any authed
    expect(creative).toContain('create_task')              // creative is not read-only
  })

  it('hides create_task (write tool) from read-only roles', () => {
    expect(filterToolsForUser(registry, 'viewer').map(t => t.name)).not.toContain('create_task')
    expect(filterToolsForUser(registry, 'guest').map(t => t.name)).not.toContain('create_task')
  })

  it('owner sees all 21', () => {
    expect(filterToolsForUser(registry, 'owner')).toHaveLength(21)
  })

  it('the media-buyer reads are MEDIA_BUYING-gated read tools (not mutating)', () => {
    const mb = registry.filter(t => MEDIA_BUYER_TOOLS.includes(t.name))
    expect(mb).toHaveLength(2)
    for (const t of mb) {
      expect(t.requiredPermission).toBe('MEDIA_BUYING')
      expect(t.mutates).toBeFalsy()
    }
  })

  it('includes the Slice-2 margin & forecasting tools', () => {
    const names = registry.map(t => t.name)
    for (const n of ['get_client_profitability', 'monitor_retainer_burn', 'flag_over_servicing', 'forecast_revenue']) {
      expect(names).toContain(n)
    }
  })

  it('Slice-2 tools are FINANCE-gated read tools (not mutating)', () => {
    const slice2 = registry.filter(t => ['get_client_profitability', 'monitor_retainer_burn', 'flag_over_servicing', 'forecast_revenue'].includes(t.name))
    expect(slice2).toHaveLength(4)
    for (const t of slice2) {
      expect(t.requiredPermission).toBe('FINANCE')
      expect(t.mutates).toBeFalsy()
    }
  })
})
