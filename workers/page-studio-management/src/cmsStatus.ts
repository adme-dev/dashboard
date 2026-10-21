import { CmsManagementRequestSchema, CMS_STATUS_URL, isPlacedCmsStatus } from '../../../shared/pageStudio/cmsManagementContract'
import { boundedBody } from '../../../shared/pageStudio/boundedPrivateBody'
import { collectionDigest } from '../../../shared/pageStudio/collectionApi'
import { customerPreviewRuntimeEnvironment } from '../../../server/utils/pageStudio/customerPreviewRuntime'
import { handleCmsManagement } from './cmsManagement'

/** Status-only placement adapter. The existing dispatcher owns every transaction. */
export async function handleCmsStatusFetch(request: Request, env: Record<string, unknown>, run: Parameters<typeof handleCmsManagement>[2]) {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  if (request.url !== CMS_STATUS_URL || request.method !== 'POST') return new Response('Not found', { status: 404, headers })
  let digest = '0'.repeat(64)
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { ...headers, 'x-request-digest': digest } })
  const rejected = (status = 503) => reply('Website content service is unavailable. Check the operation status before trying again.', status)
  try {
    const body = await boundedBody(request, 16384)
    if (body.tooLarge) return rejected(400)
    digest = await collectionDigest(body.value)
    const parsed = CmsManagementRequestSchema.safeParse(body.value)
    if (!parsed.success || !isPlacedCmsStatus(parsed.data)) return rejected(400)
    if (env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production' || env.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED !== 'true'
      || !customerPreviewRuntimeEnvironment(env)) return rejected()
    return reply(await handleCmsManagement(parsed.data, env, run))
  } catch { return rejected() }
}
