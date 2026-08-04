import type { ToolContext } from '~~/server/utils/ai/toolContext'
import {
  GOD_MODE_INTERNAL_EXECUTION_HEADER,
  mintInstalledGodModeInternalExecutionDelegation
} from '~~/server/utils/godMode/internalExecutionDelegation'

type InternalMethod = 'POST' | 'PUT' | 'PATCH'

function boundedPreDispatchError(error: unknown, code: string): Error {
  const candidate = error instanceof Error ? error : new Error('internal execution delegation failed')
  return Object.assign(candidate, { boundedCode: code, preDispatch: true })
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { statusCode?: unknown, status?: unknown, response?: { status?: unknown } }
  const value = candidate.statusCode ?? candidate.status ?? candidate.response?.status
  return typeof value === 'number' ? value : null
}

/**
 * Server-internal transport for registered HTTP executors. Ordinary calls preserve cookie/bearer auth.
 * A private Task 5 MCP signer, when installed, replaces all caller authority with one exact delegation.
 */
export async function fetchInternalExecution<T = unknown>(
  path: string,
  options: { method: InternalMethod, body: unknown },
  ctx: ToolContext
): Promise<T> {
  const sourceHeaders = ctx.event.headers ?? ctx.event.node?.req?.headers ?? {}
  const headers = new Headers(sourceHeaders as HeadersInit)
  // A raw caller header is never authority. It is stripped before any internal hop and only a private
  // request-local signer may replace it.
  headers.delete(GOD_MODE_INTERNAL_EXECUTION_HEADER)

  let delegation: string | null
  try {
    delegation = await mintInstalledGodModeInternalExecutionDelegation(ctx.event, {
      method: options.method,
      path,
      body: options.body
    })
  } catch (error) {
    throw boundedPreDispatchError(error, 'internal_delegation_unavailable')
  }

  if (delegation) {
    headers.delete('authorization')
    headers.delete('cookie')
    headers.delete('x-mcp-assertion')
    headers.delete('x-mcp-secret')
    headers.delete('x-mcp-scope')
    headers.set(GOD_MODE_INTERNAL_EXECUTION_HEADER, delegation)
  }

  try {
    return await (globalThis as any).$fetch(path, {
      method: options.method,
      body: options.body,
      headers
    }) as T
  } catch (error) {
    // The downstream auth boundary rejects before its handler. This is a proven no-dispatch outcome,
    // unlike connection loss/5xx after the request may have reached a mutation handler.
    if ([401, 403, 409].includes(statusCode(error) ?? 0)) {
      throw boundedPreDispatchError(error, 'internal_delegation_rejected')
    }
    throw error
  }
}
