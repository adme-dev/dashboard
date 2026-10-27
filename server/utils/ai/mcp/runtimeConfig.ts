// server/utils/ai/mcp/runtimeConfig.ts
// One runtime-config reader for MCP discovery (tools/list), the connector preview (my-tools) and
// execution (tools/call), so all three see the same master switch, suite flags and staff grants.
// Precedence: the request's Cloudflare binding first, the local process environment second. A binding
// that is present always wins, even when it is not a string (it then reads as off/invalid, never as a
// fallback to a more permissive local value).
import type { H3Event } from 'h3'
import type { McpSuiteFlags } from './project'
import { parseMarketingStaffGrants, type MarketingStaffGrantConfig } from './marketingPolicy'

export interface McpRuntimeConfig {
  /** MCP_SERVER_ENABLED — the expose-layer master switch. */
  serverEnabled: boolean
  /** MCP_WORKER_ORIGIN — public Worker origin shown on the connectors page. */
  workerOrigin: string
  /**
   * MCP_REQUIRE_WRITE_SCOPE — legacy opt-in. It now only shapes owner God-mode scope-bypass auditing;
   * ordinary staff ALWAYS need the signed mcp:write scope for write-class tools, flag or not.
   */
  legacyRequireWriteScope: boolean
  suiteFlags: Required<McpSuiteFlags>
  /** MCP_MARKETING_STAFF_GRANTS — operator-owned JSON; invalid config grants nobody anything. */
  marketingStaffGrants: MarketingStaffGrantConfig
}

const MISSING = Symbol('missing')

function readRaw(event: H3Event | undefined, key: string): unknown | typeof MISSING {
  const env = (event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env
  if (env && typeof env === 'object' && Object.prototype.hasOwnProperty.call(env, key)) return env[key]
  return Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : MISSING
}

/** String value by binding precedence; undefined when absent or when the winning value is not a string. */
export function readMcpRuntimeValue(event: H3Event | undefined, key: string): string | undefined {
  const value = readRaw(event, key)
  return typeof value === 'string' ? value : undefined
}

function flag(event: H3Event | undefined, key: string): boolean {
  return readMcpRuntimeValue(event, key) === 'true'
}

export function resolveMcpRuntimeConfig(event?: H3Event): McpRuntimeConfig {
  const grantsRaw = readRaw(event, 'MCP_MARKETING_STAFF_GRANTS')
  return {
    serverEnabled: flag(event, 'MCP_SERVER_ENABLED'),
    workerOrigin: readMcpRuntimeValue(event, 'MCP_WORKER_ORIGIN') ?? '',
    legacyRequireWriteScope: flag(event, 'MCP_REQUIRE_WRITE_SCOPE'),
    suiteFlags: {
      generation: flag(event, 'MCP_GEN_TOOLS_ENABLED'),
      writes: flag(event, 'MCP_WRITE_TOOLS_ENABLED'),
      financial: flag(event, 'MCP_FINANCIAL_TOOLS_ENABLED'),
      video: flag(event, 'MCP_VIDEO_TOOLS_ENABLED'),
      videoGeneration: flag(event, 'MCP_VIDEO_GEN_ENABLED'),
      banners: flag(event, 'MCP_BANNER_TOOLS_ENABLED'),
      feeds: flag(event, 'MCP_FEED_TOOLS_ENABLED'),
      googleAdsRead: flag(event, 'GOOGLE_ADS_MCP_READ_ENABLED'),
      googleAdsWrite: flag(event, 'GOOGLE_ADS_MCP_WRITE_ENABLED'),
      googleAdsAutomation: flag(event, 'GOOGLE_ADS_MCP_AUTOMATION_ENABLED'),
      googleAdsDestructive: flag(event, 'GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED')
    },
    marketingStaffGrants: parseMarketingStaffGrants(grantsRaw === MISSING ? undefined : grantsRaw)
  }
}
