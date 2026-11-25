export type McpPromptCategory = 'reporting' | 'feeds' | 'google_ads' | 'social' | 'tracking' | 'owner_admin'
export type McpPromptAudience = 'staff' | 'owner' | 'shared'
export type McpSnippetPlacement = 'agency/ai/connectors'

export interface McpPromptParams {
  clientName?: string
  storeCode?: string
}

export interface McpStarterPrompt {
  id: string
  title: string
  category: McpPromptCategory
  audience: McpPromptAudience
  placements: readonly McpSnippetPlacement[]
  requiredTools: readonly string[]
  requiresWriteScope: boolean
  exampleParams?: Readonly<McpPromptParams>
  render: (params?: McpPromptParams) => string
}

export interface RenderedMcpStarterPrompt {
  id: string
  title: string
  category: McpPromptCategory
  audience: McpPromptAudience
  requiredTools: readonly string[]
  requiresWriteScope: boolean
  text: string
}

function fill(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed || fallback
}

/**
 * Single typed registry for copyable MCP setup snippets and starter prompts shown in
 * XeroFlow. Tested against the authoritative MCP tool catalog so tool names and
 * workflow guidance cannot drift silently.
 */
export const MCP_STARTER_PROMPTS: readonly McpStarterPrompt[] = Object.freeze([
  {
    id: 'mcp.reporting.campaign-breakdown',
    title: 'Stored campaign performance',
    category: 'reporting',
    audience: 'shared',
    placements: ['agency/ai/connectors'],
    requiredTools: ['get_campaign_breakdown'],
    requiresWriteScope: false,
    render: () =>
      'Show stored campaign performance for one of my assigned clients, including the reporting period and coverage gaps.'
  },
  {
    id: 'mcp.social.draft-and-submit',
    title: 'Prepare a social draft for review',
    category: 'social',
    audience: 'staff',
    placements: ['agency/ai/connectors'],
    requiredTools: ['create_social_post_draft', 'submit_social_post_for_review'],
    requiresWriteScope: true,
    render: () =>
      'Prepare a social draft for my assigned client, then submit the exact revision for independent review.'
  },
  {
    id: 'mcp.google-ads.portfolio-qa',
    title: 'Run read-only Google Ads QA',
    category: 'google_ads',
    audience: 'shared',
    placements: ['agency/ai/connectors'],
    requiredTools: ['google_ads_review_portfolio'],
    requiresWriteScope: false,
    render: () =>
      'Run a read-only Google Ads QA across my bound clients — flag wasted search terms, conversion-action issues, and policy-limited ads or PMax asset groups.'
  },
  {
    id: 'mcp.feeds.preview-health',
    title: 'Check inventory feed vehicles & readiness',
    category: 'feeds',
    audience: 'staff',
    placements: ['agency/ai/connectors'],
    requiredTools: ['marketing_get_inventory_feed_health', 'marketing_preview_inventory_feed'],
    requiresWriteScope: false,
    exampleParams: { clientName: 'Brighton RAM' },
    render: (params) => {
      const client = fill(params?.clientName, 'Brighton RAM')
      return `Show me which vehicles are currently included in ${client}’s Google and Meta inventory feeds, and flag any readiness or validation issues.`
    }
  },
  {
    id: 'mcp.feeds.update-store-code',
    title: 'Update a Google feed store code',
    category: 'feeds',
    audience: 'staff',
    placements: ['agency/ai/connectors'],
    requiredTools: ['marketing_propose_inventory_feed_change', 'marketing_execute_inventory_feed_change'],
    requiresWriteScope: true,
    exampleParams: { clientName: 'Brighton RAM', storeCode: 'BrightonRAM3187' },
    render: (params) => {
      const client = fill(params?.clientName, 'Brighton RAM')
      const storeCode = fill(params?.storeCode, 'BrightonRAM3187')
      return `Preview updating ${client}’s Google inventory feed store code to ${storeCode}. Wait for my confirmation before applying, and tell me whether peer review is required.`
    }
  },
  {
    id: 'mcp.tracking.onboarding-checklist',
    title: 'Check client tracking onboarding',
    category: 'tracking',
    audience: 'shared',
    placements: ['agency/ai/connectors'],
    requiredTools: ['get_client_tracking_onboarding'],
    requiresWriteScope: false,
    exampleParams: { clientName: 'Brighton RAM' },
    render: (params) => {
      const client = fill(params?.clientName, 'Brighton RAM')
      return `Show the tracking onboarding checklist and current stored progress for ${client}, and tell me the next step.`
    }
  },
  {
    id: 'mcp.owner.feed-change',
    title: 'Owner: update an existing inventory feed',
    category: 'owner_admin',
    audience: 'owner',
    placements: ['agency/ai/connectors'],
    requiredTools: [
      'owner_get_inventory_feed_health',
      'owner_propose_inventory_feed_change',
      'owner_execute_inventory_feed_change'
    ],
    requiresWriteScope: true,
    exampleParams: { clientName: 'Brighton RAM', storeCode: 'BrightonRAM3187' },
    render: (params) => {
      const client = fill(params?.clientName, 'Brighton RAM')
      const storeCode = fill(params?.storeCode, 'BrightonRAM3187')
      return `Inspect ${client}’s inventory feeds, preview updating the Google feed store code to ${storeCode}, and wait for my confirmation before applying.`
    }
  },
  {
    id: 'mcp.owner.dealer-link-and-repair',
    title: 'Owner: audit dealer links & repair unscoped feeds',
    category: 'owner_admin',
    audience: 'owner',
    placements: ['agency/ai/connectors'],
    requiredTools: [
      'owner_list_dealer_feed_links',
      'owner_inspect_org_feeds',
      'owner_discover_inventory_sellers',
      'owner_repair_feed_seller_scope'
    ],
    requiresWriteScope: true,
    exampleParams: { clientName: 'Brighton RAM' },
    render: (params) => {
      const client = fill(params?.clientName, 'Brighton RAM')
      return `Inspect ${client}’s dealer feed link and raw Social Dashboard feeds (including paused or unscoped feeds), list any ownership diagnostics, and preview repairing missing sellerIds before making any write.`
    }
  }
])

export function renderCursorMcpConfig(connectorUrl: string): string {
  const url = connectorUrl.trim() || 'https://mcp-server.adme-dev.workers.dev/mcp'
  return JSON.stringify({
    mcpServers: {
      xeroflow: {
        url
      }
    }
  }, null, 2)
}

export function selectStarterPromptsForTools(
  toolNames: Iterable<string>,
  options: { isGodMode?: boolean, readOnly?: boolean } = {}
): RenderedMcpStarterPrompt[] {
  const available = new Set(toolNames)
  const isGodMode = Boolean(options.isGodMode)
  const readOnly = Boolean(options.readOnly)

  return MCP_STARTER_PROMPTS
    .filter((prompt) => {
      if (prompt.audience === 'owner' && !isGodMode) return false
      if (prompt.audience === 'staff' && isGodMode) return false
      if (readOnly && prompt.requiresWriteScope) return false
      return prompt.requiredTools.every(tool => available.has(tool))
    })
    .map(prompt => ({
      id: prompt.id,
      title: prompt.title,
      category: prompt.category,
      audience: prompt.audience,
      requiredTools: prompt.requiredTools,
      requiresWriteScope: prompt.requiresWriteScope,
      text: prompt.render(prompt.exampleParams)
    }))
}
