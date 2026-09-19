import { requirePageStudioMachineAuth } from '~~/server/utils/pageStudio/machineAuth'
import { commitPageStudioContentAttachment } from '~~/server/utils/pageStudio/contentAttachmentCompletion'
import { pageStudioInternalHttpError } from '~~/server/utils/pageStudio/http'
import { requirePageStudioProvisioningRuntime } from '~~/server/utils/pageStudio/provisioningBinding'

export default eventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
    const { binding, environment } = requirePageStudioProvisioningRuntime(env)
    const attachment = binding as typeof binding & { readContentAttachmentPreparation?: (scope: unknown) => Promise<unknown> }
    if (typeof attachment.readContentAttachmentPreparation !== 'function') throw createError({ statusCode: 503, statusMessage: 'CMS setup is unavailable' })
    return await commitPageStudioContentAttachment(await readBody(event), environment, {
      binding: attachment as typeof attachment & { readContentAttachmentPreparation: (scope: unknown) => Promise<unknown> }
    })
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
})
