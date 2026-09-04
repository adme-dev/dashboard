import { PageStudioDocumentSaveSchema } from '~~/shared/pageStudio/document'
import { requireAgencyPageStudioAccess } from '~~/server/utils/pageStudio/access'
import {
  replayPageStudioDocumentSave,
  savePageStudioDocument
} from '~~/server/utils/pageStudio/documents'
import { executePageStudioDocumentSave } from '~~/server/utils/pageStudio/godModeMutations'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSiteId } from '~~/server/utils/pageStudio/schemas'

export default eventHandler(async (event) => {
  try {
    const { tenantId, user } = await requireAgencyPageStudioAccess(event, 'PAGE_STUDIO_EDIT')
    const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
    if (!siteId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio site ID' })
    const parsed = PageStudioDocumentSaveSchema.safeParse(await readBody(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message || 'Invalid Page Studio document' })
    }
    return await executePageStudioDocumentSave(
      event,
      async db => await savePageStudioDocument(db, {
        actorId: user.id,
        document: parsed.data.document,
        expectedRevision: parsed.data.expectedRevision,
        siteId: siteId.data,
        tenantId
      }),
      async (db, resultReference) => await replayPageStudioDocumentSave(db, tenantId, resultReference)
    )
  } catch (error) {
    pageStudioHttpError(error)
  }
})
