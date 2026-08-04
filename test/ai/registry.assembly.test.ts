import { describe, it, expect } from 'vitest'
import { registry } from '~~/server/utils/ai/tools/index'
import { filterToolsForUser } from '~~/server/utils/ai/toolRegistry'
import { projectReadOnlyTools } from '~~/server/utils/ai/mcp/project'

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
// Per-department packs (PRD §7): delivery writes (Account/Producer) + capacity read.
const DELIVERY_TOOLS = ['assign_task', 'propose_status_change', 'propose_brief_convert']
const DELIVERY_READS = ['get_capacity']
// Sales/CRM pack (PRD §7 Sales): 3 writes + 1 read (draft_followup).
const CRM_WRITES = ['propose_opportunity', 'log_crm_activity', 'propose_quote']
const CRM_READS = ['draft_followup']
// Finance / Bookkeeper pack (PRD §7): 3 writes (expense approve, EOM generate rich_confirm, expense classify).
const FINANCE_WRITES = ['propose_expense_approval', 'propose_eom_generate', 'propose_expense_classify']
// Creative pack (PRD §7): queue read + proof-status write.
const CREATIVE_READS = ['get_my_creative_queue']
const CREATIVE_WRITES = ['propose_proof_status']
// Cross-cutting: promote a fact to department-shared memory (MANAGEMENT-gated).
const SHARED_MEMORY_WRITES = ['propose_team_memory']
// Ops Autopilot read tools: C1 pacing watchdog (MEDIA_BUYING) + C5 brief gatekeeper (any authed).
const OPS_AUTOPILOT_READS = ['check_pacing', 'check_brief_completeness']
// Read-coverage expansion (sub-project 1): CRM/leads/listening/inbox/EDM reads — auto-projected over MCP.
const READ_COVERAGE_TOOLS = ['search_crm', 'get_crm_pipeline', 'get_leads', 'get_social_listening', 'get_social_inbox', 'get_email_campaign_performance', 'recommend_social_news']
// remember = immediate personal-memory mutation; MCP coordinates it transactionally without confirmation.
const ALL = [...READ_TOOLS, ...SLICE2_TOOLS, ...MEDIA_BUYER_TOOLS, ...WRITE_TOOLS, ...DELIVERY_TOOLS, ...DELIVERY_READS, ...CRM_WRITES, ...CRM_READS, ...FINANCE_WRITES, ...CREATIVE_READS, ...CREATIVE_WRITES, ...SHARED_MEMORY_WRITES, ...OPS_AUTOPILOT_READS, ...READ_COVERAGE_TOOLS, 'remember']

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

  it('classifies proposal writes and the immediate transactional memory write as mutations', () => {
    expect(registry.filter(t => t.mutates).map(t => t.name).sort()).toEqual(
      [...WRITE_TOOLS, ...DELIVERY_TOOLS, ...CRM_WRITES, ...FINANCE_WRITES, ...CREATIVE_WRITES, ...SHARED_MEMORY_WRITES, 'remember'].sort())
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

  it('owner sees the whole registry', () => {
    expect(filterToolsForUser(registry, 'owner')).toHaveLength(registry.length)
    expect(registry.length).toBe(ALL.length)
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

  it('exposes the read-coverage tools over MCP (read-only) with the intended permissions', () => {
    const names = registry.map(t => t.name)
    for (const n of READ_COVERAGE_TOOLS) expect(names).toContain(n)
    // none of them mutate → all projected by projectReadOnlyTools for an owner
    const projected = projectReadOnlyTools(registry, 'owner').map(t => t.name)
    for (const n of READ_COVERAGE_TOOLS) expect(projected).toContain(n)
    const byName = Object.fromEntries(registry.map(t => [t.name, t]))
    expect(byName['search_crm'].requiredPermission).toBe('CLIENTS')
    expect(byName['get_crm_pipeline'].requiredPermission).toBe('CLIENTS')
    expect(byName['get_leads'].requiredPermission).toBeUndefined()
    expect(byName['get_social_listening'].requiredPermission).toBe('CLIENTS')
    expect(byName['get_social_inbox'].requiredPermission).toBe('CLIENTS')
    expect(byName['recommend_social_news'].requiredPermission).toBe('CLIENTS')
    expect(byName['get_email_campaign_performance'].requiredPermission).toBe('MANAGEMENT')
    for (const n of READ_COVERAGE_TOOLS) expect(byName[n].mutates).toBeUndefined()
  })
})
