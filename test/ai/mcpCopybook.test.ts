import { describe, expect, it } from 'vitest'
import {
  MCP_STARTER_PROMPTS,
  renderCursorMcpConfig,
  selectStarterPromptsForTools
} from '~~/shared/ai/mcpCopybook'
import { registry } from '~~/server/utils/ai/tools'
import { projectGodModeTools, projectStaffOnlyMcpTools } from '~~/server/utils/ai/mcp/registry'

const allSuiteFlags = new Proxy({}, { get: () => true }) as never

describe('MCP copybook registry (drift & snapshot guard)', () => {
  it('references only real, registered MCP tool names across owner and staff catalogs', () => {
    const baseContext = {
      tools: registry as never,
      role: 'owner' as const,
      scopes: ['mcp:read', 'mcp:write'],
      requireWriteScope: false,
      suiteFlags: allSuiteFlags,
      governanceBypass: true
    }
    const ownerToolNames = new Set(projectGodModeTools(baseContext).map(t => t.name))
    const staffToolNames = new Set(projectStaffOnlyMcpTools(baseContext).map(t => t.name))
    const allRegisteredTools = new Set([...ownerToolNames, ...staffToolNames])

    const ids = new Set<string>()
    for (const prompt of MCP_STARTER_PROMPTS) {
      expect(ids.has(prompt.id)).toBe(false)
      ids.add(prompt.id)
      expect(prompt.requiredTools.length).toBeGreaterThan(0)
      for (const toolName of prompt.requiredTools) {
        expect(allRegisteredTools.has(toolName), `Unknown MCP tool "${toolName}" in prompt "${prompt.id}"`).toBe(true)
        if (prompt.audience === 'owner') {
          expect(ownerToolNames.has(toolName), `Owner prompt "${prompt.id}" references non-owner tool "${toolName}"`).toBe(true)
        }
        if (prompt.audience === 'staff') {
          expect(staffToolNames.has(toolName), `Staff prompt "${prompt.id}" references non-staff tool "${toolName}"`).toBe(true)
        }
      }
    }
  })

  it('filters prompts accurately by audience, available tools, and read-only policy', () => {
    const staffReadOnly = selectStarterPromptsForTools(
      ['get_campaign_breakdown', 'create_social_post_draft', 'submit_social_post_for_review'],
      { isGodMode: false, readOnly: true }
    )
    expect(staffReadOnly.map(p => p.id)).toEqual(['mcp.reporting.campaign-breakdown'])

    const staffWritable = selectStarterPromptsForTools(
      ['get_campaign_breakdown', 'create_social_post_draft', 'submit_social_post_for_review', 'marketing_get_inventory_feed_health', 'marketing_preview_inventory_feed'],
      { isGodMode: false, readOnly: false }
    )
    expect(staffWritable.map(p => p.id)).toEqual([
      'mcp.reporting.campaign-breakdown',
      'mcp.social.draft-and-submit',
      'mcp.feeds.preview-health'
    ])

    const ownerPrompts = selectStarterPromptsForTools(
      [
        'get_campaign_breakdown',
        'owner_get_inventory_feed_health',
        'owner_propose_inventory_feed_change',
        'owner_execute_inventory_feed_change',
        'owner_list_dealer_feed_links',
        'owner_inspect_org_feeds',
        'owner_discover_inventory_sellers',
        'owner_repair_feed_seller_scope'
      ],
      { isGodMode: true, readOnly: false }
    )
    expect(ownerPrompts.map(p => p.id)).toEqual([
      'mcp.reporting.campaign-breakdown',
      'mcp.owner.feed-change',
      'mcp.owner.dealer-link-and-repair'
    ])
  })

  it('renders deterministic starter prompts and valid Cursor mcp.json config', () => {
    const rendered = MCP_STARTER_PROMPTS.map(p => ({
      id: p.id,
      text: p.render(p.exampleParams)
    }))
    expect(rendered).toEqual([
      {
        id: 'mcp.reporting.campaign-breakdown',
        text: 'Show stored campaign performance for one of my assigned clients, including the reporting period and coverage gaps.'
      },
      {
        id: 'mcp.social.draft-and-submit',
        text: 'Prepare a social draft for my assigned client, then submit the exact revision for independent review.'
      },
      {
        id: 'mcp.google-ads.portfolio-qa',
        text: 'Run a read-only Google Ads QA across my bound clients — flag wasted search terms, conversion-action issues, and policy-limited ads or PMax asset groups.'
      },
      {
        id: 'mcp.feeds.preview-health',
        text: 'Show me which vehicles are currently included in Brighton RAM’s Google and Meta inventory feeds, and flag any readiness or validation issues.'
      },
      {
        id: 'mcp.feeds.update-store-code',
        text: 'Preview updating Brighton RAM’s Google inventory feed store code to BrightonRAM3187. Wait for my confirmation before applying, and tell me whether peer review is required.'
      },
      {
        id: 'mcp.tracking.onboarding-checklist',
        text: 'Show the tracking onboarding checklist and current stored progress for Brighton RAM, and tell me the next step.'
      },
      {
        id: 'mcp.owner.feed-change',
        text: 'Inspect Brighton RAM’s inventory feeds, preview updating the Google feed store code to BrightonRAM3187, and wait for my confirmation before applying.'
      },
      {
        id: 'mcp.owner.dealer-link-and-repair',
        text: 'Inspect Brighton RAM’s dealer feed link and raw Social Dashboard feeds (including paused or unscoped feeds), list any ownership diagnostics, and preview repairing missing sellerIds before making any write.'
      }
    ])

    const cursorJson = renderCursorMcpConfig('https://mcp-server.adme-dev.workers.dev/mcp')
    expect(JSON.parse(cursorJson)).toEqual({
      mcpServers: {
        xeroflow: {
          url: 'https://mcp-server.adme-dev.workers.dev/mcp'
        }
      }
    })
  })
})
