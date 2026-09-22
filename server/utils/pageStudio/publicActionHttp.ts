import { createError, setHeader, setResponseStatus, type H3Event } from 'h3'
import { z } from 'zod'
import { readPageStudioJson } from './boundedJson'
import { projectPageStudioInternalError } from './http'
import { requirePageStudioMachineAuth } from './machineAuth'
import {
  PublicActionFormRequestSchema, PublicActionFormRecoverySchema,
  admitPublishedFormAction, acknowledgePublishedFormAction,
  completePublishedFormAction, recoverPublishedFormAction
} from './publicActionInvocations'

const existing = z.union([PublicActionFormRequestSchema, PublicActionFormRecoverySchema])
const requestSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('admit'), request: PublicActionFormRequestSchema }).strict(),
  z.object({ phase: z.literal('acknowledge'), request: existing }).strict(),
  z.object({ phase: z.literal('complete'), request: existing }).strict(),
  z.object({ phase: z.literal('recover'), request: PublicActionFormRecoverySchema }).strict()
])

/** Machine gateway only. A browser/creator session cannot authorize this route.
 * Native resolves publication and all execution/storage identities itself. */
export async function handlePublishedFormAction(event: H3Event) {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    requirePageStudioMachineAuth(event)
    const raw = await readPageStudioJson(event, 80_000, [
      'Public action request requires JSON', 'Public action request exceeds byte limit',
      'Public action request required', 'Invalid public action body', 'Invalid public action JSON'
    ])
    const parsed = requestSchema.safeParse(raw)
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid public action request' })
    const { phase, request } = parsed.data
    const env = (event.context.cloudflare?.env ?? {}) as Record<string, unknown>
    switch (phase) {
      case 'admit': return await admitPublishedFormAction(request, env)
      case 'acknowledge': return await acknowledgePublishedFormAction(request, env)
      case 'complete': return await completePublishedFormAction(request, env)
      case 'recover': return await recoverPublishedFormAction(request, env)
    }
  } catch (error) {
    const { statusCode } = projectPageStudioInternalError(error)
    // Provider/SQL/validation messages may contain answers or secrets. Never
    // forward or log them, including on this private transport boundary.
    if (statusCode >= 500) console.error('[page-studio-public-action] request failed', { statusCode })
    setResponseStatus(event, statusCode)
    return { error: { code: 'PUBLIC_ACTION_REQUEST_FAILED', message: 'Published form action unavailable' } }
  }
}
