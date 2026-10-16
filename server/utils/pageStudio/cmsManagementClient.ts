import type { z } from 'zod'
import type { CmsAdoptionStatusSchema, CmsGraphCommitReceiptSchema, CmsGraphRestoreReceiptSchema, CmsManagementOperation } from '~~/shared/pageStudio/cmsManagementContract'
import { CmsManagementRequestSchema, cmsManagementResultSchema } from '~~/shared/pageStudio/cmsManagementContract'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { PageStudioBusinessContentError } from './businessContent'
import { capturePageStudioRpcMethod } from './privateRpc'
import type { CmsGraphPrincipal } from './cmsGraphRead'

const unavailable = () => new PageStudioBusinessContentError('CMS_MANAGEMENT_UNAVAILABLE', 503, 'Website content service is unavailable. Check the operation status before trying again.')
/** Private service-binding call only. An uncertain write is never replayed locally. */
export function callCmsManagement(operation: 'adoption', body: unknown, principal: CmsGraphPrincipal): Promise<z.infer<typeof CmsAdoptionStatusSchema>>
export function callCmsManagement(operation: 'transition' | 'checkpoint', body: unknown, principal: CmsGraphPrincipal): Promise<z.infer<typeof CmsGraphCommitReceiptSchema>>
export function callCmsManagement(operation: 'restore', body: unknown, principal: CmsGraphPrincipal): Promise<z.infer<typeof CmsGraphRestoreReceiptSchema>>
export async function callCmsManagement(operation: CmsManagementOperation, body: unknown, principal: CmsGraphPrincipal) {
  const env = principal.source === 'native-login' ? principal.request.env : principal.env
  const call = capturePageStudioRpcMethod(env.PAGE_STUDIO_MANAGEMENT as Record<string, unknown> | undefined, 'cmsAuthoring')
  if (!call) throw unavailable()
  let request: ReturnType<typeof CmsManagementRequestSchema.parse>
  try {
    const serialized = principal.source === 'native-login'
      ? { source: principal.source, request: { actor: principal.request.actor, siteId: principal.request.siteId,
          ...(principal.request.collectionAccess === undefined ? {} : { collectionAccess: principal.request.collectionAccess }),
          login: { ...principal.request.login, issuedAt: principal.request.login.issuedAt.toISOString(), expiresAt: principal.request.login.expiresAt.toISOString() } } }
      : { source: principal.source, claims: principal.claims, capability: principal.capability }
    request = CmsManagementRequestSchema.parse(structuredClone({ operation, body, principal: serialized,
      expectedEnvironment: env.PAGE_STUDIO_RELEASE_ENVIRONMENT, contentEnvironment: env.PAGE_STUDIO_CONTENT_ENVIRONMENT }))
  } catch { throw unavailable() }
  const requestDigest = await collectionDigest(request)
  let response: unknown
  try {
    response = await call(structuredClone(request))
  } catch {
    throw unavailable()
  }
  const parsed = cmsManagementResultSchema(operation).safeParse(response)
  if (!parsed.success || parsed.data.requestDigest !== requestDigest) throw unavailable()
  if (!parsed.data.ok) throw new PageStudioBusinessContentError(parsed.data.error.code, parsed.data.error.statusCode, parsed.data.error.message)
  return parsed.data.value
}
