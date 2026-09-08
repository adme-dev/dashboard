import { requireClientAuth } from '~~/server/utils/clientAuth'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'
import { PageStudioSetupProposalBody } from '~~/server/utils/pageStudio/schemas'
import { createPageStudioSetupProposal } from '~~/server/utils/pageStudio/setupProposal'

export default eventHandler(async (event) => {
  try {
    const user = await requireClientAuth(event)
    if (!['admin', 'manager'].includes(user.role)) {
      throw createError({ statusCode: 403, statusMessage: 'Page Studio editing access denied' })
    }
    const parsed = PageStudioSetupProposalBody.omit({ scope: true }).safeParse(await readBody(event))
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Page Studio setup request' })
    return {
      proposal: createPageStudioSetupProposal({
        businessName: parsed.data.name,
        starterVersion: parsed.data.starterVersion,
        setupSource: parsed.data.setupSource,
        setupBrief: parsed.data.setupBrief
      })
    }
  } catch (error) {
    pageStudioHttpError(error)
  }
})
