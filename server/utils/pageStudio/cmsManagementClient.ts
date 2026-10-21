import type { z } from 'zod'
import type { CmsAdoptionStatusSchema, CmsGraphCommitReceiptSchema, CmsGraphRestoreReceiptSchema, CmsManagementOperation } from '~~/shared/pageStudio/cmsManagementContract'
import { CmsManagementRequestSchema, cmsManagementResultSchema, CMS_STATUS_URL, isPlacedCmsStatus } from '~~/shared/pageStudio/cmsManagementContract'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { PageStudioBusinessContentError } from './businessContent'
import { capturePageStudioRpcMethod } from './privateRpc'
import type { CmsGraphPrincipal } from './cmsGraphRead'
import { placedAuthorityFetch } from './placedAuthorityFetch'

const unavailable = () => new PageStudioBusinessContentError('CMS_MANAGEMENT_UNAVAILABLE', 503, 'Website content service is unavailable. Check the operation status before trying again.')
/** Private service-binding call only. An uncertain write is never replayed locally. */
export function callCmsManagement(operation: 'adoption', body: unknown, principal: CmsGraphPrincipal): Promise<z.infer<typeof CmsAdoptionStatusSchema>>
export function callCmsManagement(operation: 'transition' | 'checkpoint', body: unknown, principal: CmsGraphPrincipal): Promise<z.infer<typeof CmsGraphCommitReceiptSchema>>
export function callCmsManagement(operation: 'restore', body: unknown, principal: CmsGraphPrincipal): Promise<z.infer<typeof CmsGraphRestoreReceiptSchema>>
export async function callCmsManagement(operation: CmsManagementOperation, body: unknown, principal: CmsGraphPrincipal) {
  const source = principal.source
  const env = source === 'native-login' ? principal.request.env : principal.env
  const binding = env.PAGE_STUDIO_MANAGEMENT as Record<string, unknown> | undefined
  let response: unknown, requestDigest: string
  try {
    let serialized
    if (source === 'native-login') {
      const { actor, siteId, collectionAccess, login } = principal.request
      serialized = { source, request: { actor, siteId, ...(collectionAccess === undefined ? {} : { collectionAccess }),
        login: { ...login, issuedAt: login.issuedAt.toISOString(), expiresAt: login.expiresAt.toISOString() } } }
    } else serialized = { source, claims: principal.claims, capability: principal.capability }
    const request = CmsManagementRequestSchema.parse(structuredClone({ operation, body, principal: serialized,
      expectedEnvironment: env.PAGE_STUDIO_RELEASE_ENVIRONMENT, contentEnvironment: env.PAGE_STUDIO_CONTENT_ENVIRONMENT }))
    if (isPlacedCmsStatus(request)) {
      response = (await placedAuthorityFetch(binding, CMS_STATUS_URL, request, unavailable().message)).value
      requestDigest = await collectionDigest(request)
    }
    else {
      const call = capturePageStudioRpcMethod(binding, 'cmsAuthoring')
      if (!call) throw unavailable()
      requestDigest = await collectionDigest(request)
      response = await call(structuredClone(request))
    }
  } catch {
    throw unavailable()
  }
  const parsed = cmsManagementResultSchema(operation).safeParse(response)
  if (!parsed.success || parsed.data.requestDigest !== requestDigest) throw unavailable()
  if (!parsed.data.ok) throw new PageStudioBusinessContentError(parsed.data.error.code, parsed.data.error.statusCode, parsed.data.error.message)
  return parsed.data.value
}
