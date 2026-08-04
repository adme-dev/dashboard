// server/api/internal/mcp/exchange.post.ts
// MCP Server Phase 1 (TODO A) — the Worker's OAuth /callback posts the app-issued assertion here to
// resolve it to a userId before completing the OAuth grant. Verification (HMAC + expiry) is single-sourced
// in assertion.ts (tested), so the Worker never does crypto itself. Auth: x-mcp-secret == MCP_INTERNAL_SECRET.
// HARD-gated by MCP_SERVER_ENABLED.
import { defineEventHandler, getHeader, readBody, createError } from 'h3'
import { verifyMcpAssertion } from '~~/server/utils/ai/mcp/assertion'
import { resolveGodModeAuthority } from '~~/server/utils/godMode/authority'

export default defineEventHandler(async (event) => {
  if (process.env.MCP_SERVER_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'MCP server disabled' })
  }
  // Always require the shared secret (no dev bypass — that was a fail-open gate in non-prod builds).
  const expectedSecret = process.env.MCP_INTERNAL_SECRET
  const secret = getHeader(event, 'x-mcp-secret')
  if (!expectedSecret || secret !== expectedSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const hs = process.env.MCP_HANDSHAKE_SECRET
  if (!hs) throw createError({ statusCode: 503, statusMessage: 'MCP_HANDSHAKE_SECRET not configured' })

  const body = await readBody<{ assertion?: string }>(event).catch(() => null)
  const verified = await verifyMcpAssertion(body?.assertion || '', hs)
  if (!verified) throw createError({ statusCode: 401, statusMessage: 'Invalid or expired assertion' })

  // The OAuth assertion carries identity + consented scope only. Resolve owner authority here from the
  // verified subject; a client-provided role/God-mode bit is never accepted by this exchange.
  const authority = await resolveGodModeAuthority(event, verified.uid)
  return { userId: verified.uid, scope: verified.scope, godMode: authority.active }
})
