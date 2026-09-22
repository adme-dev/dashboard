import { createError, getHeader, setHeader, type H3Event } from 'h3'
import { readPageStudioJson } from './boundedJson'
import { pageStudioInternalHttpError } from './http'
import { requirePageStudioMachineAuth } from './machineAuth'
import { resolvePageStudioSessionEnvironment, resolvePageStudioSessionPublicKey, verifyPageStudioSessionToken } from './sessions'
import { acceptManagedFeatureCandidate, ManagedFeatureAcceptanceRequestSchema } from './featureCandidateApplication'
import { readManagedFeatureContext, ManagedFeatureContextRequestSchema } from './featureApplicationContext'

export async function handleFeatureApplication(event: H3Event, operation: 'accept' | 'context') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    requirePageStudioMachineAuth(event)
    const token = getHeader(event, 'x-page-studio-session')
    if (!token || token.length > 8192) throw createError({ statusCode: 401, statusMessage: 'Page Studio session required' })
    const claims = await verifyPageStudioSessionToken(token, resolvePageStudioSessionPublicKey(event), resolvePageStudioSessionEnvironment(event).issuer)
    const body = await readPageStudioJson(event, 4096, ['Features require JSON', 'Feature request exceeds byte limit', 'Feature request required', 'Invalid feature request', 'Invalid feature JSON'])
    const parsed = (operation === 'accept' ? ManagedFeatureAcceptanceRequestSchema : ManagedFeatureContextRequestSchema).safeParse(body)
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid feature request' })
    const principal = { source: 'studio-session' as const, claims, env: (event.context.cloudflare?.env ?? {}) as Record<string, unknown>, capability: operation === 'context' ? 'workspace:checkpoint' as const : 'model:invoke' as const }
    return operation === 'accept' ? await acceptManagedFeatureCandidate(body, principal) : await readManagedFeatureContext(body, principal)
  } catch (error) { return pageStudioInternalHttpError(event, error) }
}
