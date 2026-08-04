import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { markTrustedPreDispatchError } from '~~/server/utils/ai/executionErrorProvenance'
import {
  GOD_MODE_INTERNAL_EXECUTION_HEADER,
  mintInstalledGodModeInternalExecutionDelegation
} from '~~/server/utils/godMode/internalExecutionDelegation'

type InternalMethod = 'POST' | 'PUT' | 'PATCH'

function boundedPreDispatchError(error: unknown, code: string): Error {
  return markTrustedPreDispatchError(
    error instanceof Error ? error : new Error('internal execution delegation failed'),
    code
  )
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

  // Once `$fetch` begins there is no trustworthy status-only proof of dispatch state. A route handler
  // may perform a side effect and then return 401/403/409, so every downstream error remains ambiguous
  // unless a future cryptographically authenticated rejection receipt proves middleware rejection.
  return await (globalThis as any).$fetch(path, {
    method: options.method,
    body: options.body,
    headers
  }) as T
}
