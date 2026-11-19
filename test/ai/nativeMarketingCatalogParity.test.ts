import { describe, it, expect } from 'vitest'
import { MCP_STAFF_TOOL_POLICY } from '~~/server/utils/ai/mcp/marketingPolicy'
import { registry } from '~~/server/utils/ai/tools/index'
import { DEPARTMENT_TOOL_NAMES } from '~~/server/utils/ai/mcp/departmentToolNames'
import { ADS_STAFF_READ_NAMES, ADS_STAFF_PLAN_NAMES, ADS_STAFF_REVIEW_NAMES, GTM_STAFF_NAMES } from '~~/server/utils/ai/mcp/marketingTask4Names'
import { SOCIAL_MCP_TOOL_NAMES } from '~~/server/utils/ai/mcp/socialToolNames'
import { task4StaffTools } from '~~/server/utils/ai/mcp/marketingTask4Tools'
import { PERSONAS } from '~~/server/utils/ai/personas'
import type { McpSuiteFlags } from '~~/server/utils/ai/mcp/project'

// Regression guard: a staff tool added to the MCP must also reach XeroFlow's own AI Chat.
describe('native chat covers the full staff MCP catalogue', () => {
  it('every reviewed staff MCP tool is reachable from native chat (registry or staff suites)', () => {
    const reachable = new Set([...registry.map(tool => tool.name), ...DEPARTMENT_TOOL_NAMES,
      ...ADS_STAFF_READ_NAMES, ...ADS_STAFF_PLAN_NAMES, ...ADS_STAFF_REVIEW_NAMES, ...GTM_STAFF_NAMES, ...SOCIAL_MCP_TOOL_NAMES])
    const missing = Object.entries(MCP_STAFF_TOOL_POLICY)
      .filter(([, entry]) => entry.status === 'reviewed').map(([name]) => name).filter(name => !reachable.has(name))
    expect(missing).toEqual([])
  })

  it('task4StaffTools mirrors the MCP staff projection and its write classification', () => {
    const tools = task4StaffTools({ suiteFlags: { googleAdsRead: true, googleAdsWrite: true } as McpSuiteFlags })
    expect(tools.map(tool => tool.name).sort()).toEqual([...ADS_STAFF_READ_NAMES, ...ADS_STAFF_PLAN_NAMES, ...GTM_STAFF_NAMES].sort())
    expect(tools.find(tool => tool.name === 'google_ads_plan_add_negative_keywords')?.mutates).toBe(true)
    expect(tools.find(tool => tool.name === 'propose_gtm_publish')?.mutates).toBe(true)
    expect(tools.find(tool => tool.name === 'google_ads_list_keywords')?.mutates).toBe(false)
    expect(task4StaffTools({ suiteFlags: {} as McpSuiteFlags }).map(tool => tool.name)).toEqual([...GTM_STAFF_NAMES])
  })

  it('phase-3 draft/review tools reach native chat only while marketingDraftReview is on', () => {
    const on = task4StaffTools({ suiteFlags: { googleAdsRead: true, googleAdsWrite: true, marketingDraftReview: true } as McpSuiteFlags })
    expect(on.map(tool => tool.name).sort()).toEqual([...ADS_STAFF_READ_NAMES, ...ADS_STAFF_PLAN_NAMES, ...ADS_STAFF_REVIEW_NAMES, ...GTM_STAFF_NAMES].sort())
    expect(on.find(tool => tool.name === 'google_ads_run_search_term_policy')?.mutates).toBe(true)
    expect(on.find(tool => tool.name === 'google_ads_review_plan')?.mutates).toBe(true)
    expect(on.find(tool => tool.name === 'google_ads_execute_reviewed_plan')?.riskTier).toBe('rich_confirm')
    expect(on.find(tool => tool.name === 'google_ads_list_pending_reviews')?.mutates).toBe(false)
  })

  it('the Marketing and Media Buyer focuses keep the staff suites', () => {
    for (const key of ['marketing', 'media_buyer']) {
      const allow = new Set(PERSONAS[key]!.toolAllowlist)
      for (const name of ['google_ads_list_keywords', 'google_ads_plan_add_negative_keywords', 'propose_gtm_publish', 'create_social_post_draft']) {
        expect(allow.has(name), `${key}:${name}`).toBe(true)
      }
    }
  })
})
