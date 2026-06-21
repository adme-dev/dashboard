// server/api/internal/mcp/exchange.post.ts
// MCP Server Phase 1 (TODO A) — the Worker's OAuth /callback posts the app-issued assertion here to
// resolve it to a userId before completing the OAuth grant. Verification (HMAC + expiry) is single-sourced
// in assertion.ts (tested), so the Worker never does crypto itself. Auth: x-mcp-secret == MCP_INTERNAL_SECRET.
// HARD-gated by MCP_SERVER_ENABLED.
import { defineEventHandler, getHeader, readBody, createError } from 'h3'
import { verifyMcpAssertion } from '~~/server/utils/ai/mcp/assertion'

export default defineEventHandler(async (event) => {
  if (process.env.MCP_SERVER_ENABLED !== 'true') {
    throw createError({ statusCode: 503, statusMessage: 'MCP server disabled' })
  }
  const secret = getHeader(event, 'x-mcp-secret')
  if (!import.meta.dev && secret !== process.env.MCP_INTERNAL_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const hs = process.env.MCP_HANDSHAKE_SECRET
  if (!hs) throw createError({ statusCode: 503, statusMessage: 'MCP_HANDSHAKE_SECRET not configured' })

  const body = await readBody<{ assertion?: string }>(event).catch(() => null)
  const userId = await verifyMcpAssertion(body?.assertion || '', hs)
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Invalid or expired assertion' })

  return { userId }
})
