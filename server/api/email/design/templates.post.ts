import { createError, defineEventHandler } from 'h3'
import { executeDesignTemplates, readImmutableDesignTemplate } from '~~/server/utils/email-marketing/designTemplates'
import { parseDesignTemplateRequest } from '~~/shared/emailRendering/designTemplates'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { createDesignAssetStorage } from '~~/server/utils/email-marketing/designAssets'
import {
  designLibrarySession,
  designLibraryHttpError,
  readBoundedJson
} from '~~/server/utils/email-marketing/designLibraryHttp'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import { getAppUrl } from '~~/server/utils/appUrl'

export default defineEventHandler(async (event) => {
  try {
    const { env, authority, templateOnly } = await designLibrarySession(event, true, 'publish-template')
    const request = parseDesignTemplateRequest(await readBoundedJson(event))
    if (templateOnly && request.command !== 'publish-template') throw createError({ statusCode: 404, statusMessage: 'not_found' })
    const storage = {
      read: (key: string) => createDesignAssetStorage(event, getAppUrl(event)).read(key),
      url: (id: string) => createDesignAssetStorage(event, getAppUrl(event)).url(id),
      identifyUrl: (url: string) => createDesignAssetStorage(event, getAppUrl(event)).identifyUrl(url)
    }
    const receipt = await executeDesignTemplates(request, authority, createEmailRenderer(env), storage, undefined, { templateDraftOnly: templateOnly })
    if (!templateOnly) return receipt
    // Exact immutable readback travels with the same idempotent POST. This
    // does not admit GET library/history/module routes under the narrow flag.
    try {
      const publication = await transactionWithoutRetry(async db => {
        const selected = await readImmutableDesignTemplate(receipt.templateId!, receipt.revisionId, authority, db)
        await authority.publisher(selected.design.scope.clientId)
        return selected
      })
      return { ...receipt, publication }
    } catch {
      // The owner already committed. Even a readback authority denial must not
      // look like a definite rejection and erase the client's original intent.
      throw createError({ statusCode: 503, statusMessage: 'design_library_outcome_unknown' })
    }
  } catch (error) {
    designLibraryHttpError(error)
  }
})
