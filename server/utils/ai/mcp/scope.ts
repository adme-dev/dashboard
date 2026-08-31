// server/utils/ai/mcp/scope.ts
// MCP CRITICAL-B — OAuth scope helpers. The external connector consents to a scope set (mcp:read, and
// optionally mcp:write); the Worker forwards the granted scope as the `x-mcp-scope` header on every
// /tools and /call request. The app then requires `mcp:write` for any WRITE-class action when
// MCP_REQUIRE_WRITE_SCOPE is on. With the flag OFF (default) no scope check runs, so read-only-scoped
// connectors keep working unchanged — the enforcement is opt-in and non-breaking until operators have
// reconnected to grant write. This closes the gap where a "read-only"-consented connector could drive
// writes (incl. money-movers) because execution previously enforced only the user's ROLE, not the scope.

import { resolveProposeAction, isFinancialAction, MCP_CONFIRM_TOOL } from './writeTools'
import { resolveVideoProposeAction } from './videoTools'
import { resolveBannerProposeAction } from './bannerTools'
import { generationTools, isGenerationReadToolName } from './generationTools'
import { isGoogleAdsWriteToolName } from './googleAdsTools'

export const MCP_READ_SCOPE = 'mcp:read'
export const MCP_WRITE_SCOPE = 'mcp:write'

/** Parse the forwarded scope header ("mcp:read mcp:write", space- or comma-separated) into a Set. */
export function parseScopeHeader(header: string | null | undefined): Set<string> {
  return new Set((header ?? '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean))
}

export function hasWriteScope(scopes: Set<string>): boolean {
  return scopes.has(MCP_WRITE_SCOPE)
}

/** Billing/state-changing generation tools (get_generation_status is a read → excluded). */
const GEN_WRITE_NAMES = new Set(generationTools.map(t => t.name).filter(n => !isGenerationReadToolName(n)))

/**
 * Is this tool a WRITE-class tool that requires the mcp:write scope? Covers every non-read MCP surface:
 * confirm_action, every propose_ tool (2c safe, financial, video, banner), create_video_project, and the
 * billing generation tools. Pure reads (get_/list_/search_/status tools) are NOT write-class.
 * Single source of truth used by both the manifest filter (tools.post) and execution gate (call.post).
 */
export function isWriteScopeToolName(name: string): boolean {
  return name === 'remember'
    || name === MCP_CONFIRM_TOOL
    || resolveProposeAction(name) !== null
    || isFinancialAction(name)
    || resolveVideoProposeAction(name) !== null
    || resolveBannerProposeAction(name) !== null
    || isGoogleAdsWriteToolName(name)
    || GEN_WRITE_NAMES.has(name)
}
