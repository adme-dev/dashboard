import { createError } from 'h3'

import type { ToolContext } from '~~/server/utils/ai/toolContext'
import {
  GOD_MODE_INTERNAL_EXECUTION_HEADER,
  mintMcpGodModeInternalAiDelegation
} from '~~/server/utils/godMode/internalExecutionDelegation'

export type AiInternalFetchOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  query?: Record<string, unknown>
}

function invalidRequest(statusMessage: string): never {
  throw createError({ statusCode: 403, statusMessage })
}

/** Produces the one exact relative path used for both signing and dispatch. */
export function canonicalAiInternalFetchPath(request: string, query?: Record<string, unknown>): string {
  if (
    !request.startsWith('/')
    || request.startsWith('//')
    || request.includes('?')
    || request.includes('#')
    || request.includes('\\')
    || /(?:^|\/)(?:\.{1,2}|%2e(?:%2e)?)(?:\/|$)/i.test(request)
    || /%(?:2f|5c)/i.test(request)
  ) invalidRequest('Invalid AI internal route')

  const entries: Array<[string, string]> = []
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue
    if (!key || Array.isArray(value) || (value !== null && typeof value === 'object')) {
      invalidRequest('Invalid AI internal query')
    }
    entries.push([key, String(value)])
  }
  entries.sort(([left], [right]) => left.localeCompare(right))
  if (!entries.length) return request
  return `${request}?${new URLSearchParams(entries).toString()}`
}

/**
 * Relative Nitro transport for registered AI route reads. Application calls preserve their staff
 * session. MCP calls replace every caller/transport credential with a one-time exact delegation.
 */
export async function aiInternalFetch<T = unknown>(
  request: string,
  options: AiInternalFetchOptions = {},
  ctx: ToolContext
): Promise<T> {
  if (!ctx?.event) invalidRequest('AI internal request context is required')
  const method = options.method ?? 'GET'
  const body = method === 'GET' ? null : options.body
  const path = canonicalAiInternalFetchPath(request, options.query)
  const sourceHeaders = ctx.event.headers ?? ctx.event.node?.req?.headers ?? {}
  const headers = new Headers(sourceHeaders as HeadersInit)

  // Neither a caller-spoofed delegation nor MCP transport authority is valid on a nested hop.
  headers.delete(GOD_MODE_INTERNAL_EXECUTION_HEADER)
  for (const name of ['x-mcp-secret', 'x-mcp-assertion', 'x-mcp-scope']) headers.delete(name)

  if (ctx.source === 'mcp') {
    const delegation = await mintMcpGodModeInternalAiDelegation(ctx.event, {
      actorUserId: ctx.userId,
      method,
      path,
      body
    })
    headers.delete('authorization')
    headers.delete('cookie')
    headers.set(GOD_MODE_INTERNAL_EXECUTION_HEADER, delegation)
  }

  return await (globalThis as any).$fetch(path, {
    method,
    ...(method === 'POST' ? { body: options.body } : {}),
    headers
  }) as T
}
