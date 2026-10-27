// server/utils/ai/mcp/socialToolNames.ts
// Name constants for the staff social draft/review MCP suite. Dependency-free so scope.ts and
// marketingPolicy.ts can classify these tools without importing the suite's service graph.

export const SOCIAL_MCP_READ_TOOLS = Object.freeze([
  'list_social_publishing_accounts',
  'list_social_media_assets',
  'get_social_post_status'
] as const)

/** Local mutations: each needs signed mcp:write and is durably idempotent per MCP request key. */
export const SOCIAL_MCP_WRITE_TOOLS = Object.freeze([
  'create_social_post_draft',
  'update_social_post_draft',
  'submit_social_post_for_review'
] as const)

export const SOCIAL_MCP_TOOL_NAMES = Object.freeze([...SOCIAL_MCP_READ_TOOLS, ...SOCIAL_MCP_WRITE_TOOLS])

const READ_SET = new Set<string>(SOCIAL_MCP_READ_TOOLS)
const WRITE_SET = new Set<string>(SOCIAL_MCP_WRITE_TOOLS)

export function isSocialMcpToolName(name: string): boolean {
  return READ_SET.has(name) || WRITE_SET.has(name)
}

export function isSocialMcpWriteToolName(name: string): boolean {
  return WRITE_SET.has(name)
}

/** The legacy text-only social proposal tool; ordinary staff must use the reviewed suite instead. */
export const LEGACY_MCP_SOCIAL_PROPOSAL_TOOL = 'propose_schedule_post'

export const LEGACY_MCP_SOCIAL_PROPOSAL_REDIRECT
  = 'Social posts prepared over MCP use the reviewed draft workflow: call create_social_post_draft, then '
    + 'submit_social_post_for_review. A separate owner/admin approves the exact revision in XeroFlow before '
    + 'anything is scheduled or published.'
