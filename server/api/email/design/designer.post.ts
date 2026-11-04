import { designerGate } from '~~/server/utils/email-marketing/designerGate'
import { DesignModuleError } from '~~/shared/emailRendering/designModules'
import { rethrowLegacyDesignConflict, DESIGN_REVISION_CONSTRAINTS } from '~~/server/utils/email-marketing/designConflict'
import { createDesignAssetStorage } from '~~/server/utils/email-marketing/designAssets'
import { getAppUrl } from '~~/server/utils/appUrl'
import { createError, defineEventHandler, getCookie, getHeader, setHeader } from 'h3'
import { ZodError } from 'zod'
import { validateSession } from '~~/server/utils/auth'
import { assertFreshDesignAccess } from '~~/server/utils/email-marketing/designAccess'
import { assertDesignMutationRequest, readBoundedJson } from '~~/server/utils/email-marketing/designRequest'
import { DesignHandoffError, executeDesignerRoundtrip } from '~~/server/utils/email-marketing/designHandoffs'
import { DesignRevisionError } from '~~/server/utils/email-marketing/designRevisions'
import { DesignReadError } from '~~/server/utils/email-marketing/designReads'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import { parseDesignerRoundtripRequest } from '~~/shared/emailRendering/designDesigner'
import { EmailDesignError } from '~~/shared/emailRendering/designContract'
import { EmailDesignActionError } from '~~/shared/emailRendering/designActions'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const env = event.context.cloudflare?.env ?? {}
  const gate = designerGate(env)
  if (env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED !== 'true' || !gate.template) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  try {
    assertDesignMutationRequest(event, env.FIGFLOW_EDM_APP_ORIGIN)
    const authorization = getHeader(event, 'authorization')
    const token = getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client')
      || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
    const user = token ? await validateSession(token) : null
    if (!user || !token) throw createError({ statusCode: 401, statusMessage: 'design_session_invalid' })
    const request = parseDesignerRoundtripRequest(await readBoundedJson(event))
    return await executeDesignerRoundtrip(request, {
      actorId: user.id,
      assertCampaignNativeEnabled: () => {
        if (!gate.campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })
      },
      authorize: (clientId, access) => assertFreshDesignAccess(token, user.id, clientId, access)
    }, createEmailRenderer(env), undefined, { read: key => createDesignAssetStorage(event, getAppUrl(event)).read(key), url: id => createDesignAssetStorage(event, getAppUrl(event)).url(id), identifyUrl: url => createDesignAssetStorage(event, getAppUrl(event)).identifyUrl(url) })
  } catch (error) {
    if (error && typeof error === 'object' && 'constraint' in error && DESIGN_REVISION_CONSTRAINTS.has(String(error.constraint))) rethrowLegacyDesignConflict(error)
    if (error instanceof DesignModuleError) throw createError({ statusCode: error.code.includes('STORAGE_UNAVAILABLE') ? 503 : 409, statusMessage: error.code })
    if (error instanceof ZodError || error instanceof EmailDesignActionError || error instanceof EmailDesignError)
      throw createError({ statusCode: 'code' in error && ['LIMIT_EXCEEDED', 'ACTION_LIMIT_EXCEEDED'].includes(error.code) ? 413 : error instanceof EmailDesignError && ['EDIT_FORBIDDEN', 'POLICY_CHANGE_FORBIDDEN'].includes(error.code) ? 403 : 400, statusMessage: 'invalid_design_request' })
    if (error instanceof DesignHandoffError || error instanceof DesignRevisionError || error instanceof DesignReadError)
      throw createError({ statusCode: error.code === 'NOT_FOUND' ? 404 : error.code === 'DESIGNER_REQUIRED' ? 403 : 409, statusMessage: error.code })
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({ statusCode: 503, statusMessage: 'design_handoff_unavailable' })
  }
})
