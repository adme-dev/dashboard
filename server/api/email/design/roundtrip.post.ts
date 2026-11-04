import { templatePublishEnabled } from '~~/server/utils/email-marketing/templatePublishGate'
import { reviewedOverridePaths } from '~~/server/utils/email-marketing/designTemplates'
import { dependencyRecords } from '~~/server/utils/email-marketing/designModules'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { designerGate } from '~~/server/utils/email-marketing/designerGate'
import { DesignModuleError } from '~~/shared/emailRendering/designModules'
import { rethrowLegacyDesignConflict, DESIGN_REVISION_CONSTRAINTS } from '~~/server/utils/email-marketing/designConflict'
import { createDesignAssetStorage } from '~~/server/utils/email-marketing/designAssets'
import { getAppUrl } from '~~/server/utils/appUrl'
import { createError, defineEventHandler, getCookie, getHeader, setHeader } from 'h3'
import { ZodError } from 'zod'
import { validateSession } from '~~/server/utils/auth'
import { assertFreshDesignAccess, assertFreshDesignPublisher } from '~~/server/utils/email-marketing/designAccess'
import { assertDesignMutationRequest, readBoundedJson } from '~~/server/utils/email-marketing/designRequest'
import { DesignHandoffError, executeDesignRoundtrip } from '~~/server/utils/email-marketing/designHandoffs'
import { DesignRevisionError } from '~~/server/utils/email-marketing/designRevisions'
import { DesignReadError } from '~~/server/utils/email-marketing/designReads'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import { designerCapabilities } from '~~/shared/emailRendering/designDesigner'
import { parseRoundtripRequest } from '~~/shared/emailRendering/designRoundtrip'
import { EmailDesignError } from '~~/shared/emailRendering/designContract'
import { EmailDesignActionError } from '~~/shared/emailRendering/designActions'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const env = event.context.cloudflare?.env ?? {}
  const gate = designerGate(env)
  if (env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED !== 'true') throw createError({ statusCode: 404, statusMessage: 'not_found' })
  try {
    assertDesignMutationRequest(event, env.FIGFLOW_EDM_APP_ORIGIN)
    const authorization = getHeader(event, 'authorization')
    const token = getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client')
      || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
    const user = token ? await validateSession(token) : null
    if (!user || !token) throw createError({ statusCode: 401, statusMessage: 'design_session_invalid' })
    const request = parseRoundtripRequest(await readBoundedJson(event))
    const result = await executeDesignRoundtrip(request, {
      actorId: user.id,
      assertCampaignNativeEnabled: () => {
        if (!gate.campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })
      },
      authorize: (clientId, access) => assertFreshDesignAccess(token, user.id, clientId, access)
    }, createEmailRenderer(env), undefined, { read: key => createDesignAssetStorage(event, getAppUrl(event)).read(key), url: id => createDesignAssetStorage(event, getAppUrl(event)).url(id), identifyUrl: url => createDesignAssetStorage(event, getAppUrl(event)).identifyUrl(url) })
    if (request.command !== 'lookup' || !('draft' in result)) return result
    let campaignContentImages = false
    let campaignAvailable = false
    if (result.owner?.kind === 'campaign' && result.mutable && gate.campaign) {
      try {
        const role = await assertFreshDesignAccess(token, user.id, result.clientId ?? null, 'write')
        campaignAvailable = role === 'designer'
        campaignContentImages = result.draft?.state === 'structured' && env.FIGFLOW_EDM_LIBRARY_ENABLED === 'true'
      } catch (error) {
        if (!(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 403)) throw error
      }
    }
    const { blankDesignerSource, ...lookup } = result
    const authoringSource = result.draft?.state === 'structured' ? result.draft.source : blankDesignerSource
    let available = false
    if ((result.owner?.kind !== 'campaign' || result.mutable === true) && (result.owner?.kind === 'campaign' ? gate.campaign : gate.template) && authoringSource && authoringSource.source.nativeArtifact === null) {
      try {
        available = await assertFreshDesignAccess(token, user.id, authoringSource.scope.clientId, 'write') === 'designer'
      } catch (error) {
        // A read-authorised staff member may discover the ordinary draft while
        // structural authoring stays unavailable; other failures remain errors.
        if (!(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 403)) throw error
      }
    }
    let publisher = false
    const libraryAvailable = gate.campaign && available && result.draft?.state === 'structured' && env.FIGFLOW_EDM_LIBRARY_ENABLED === 'true'
    if (libraryAvailable && result.draft?.state === 'structured') {
      try {
        await assertFreshDesignPublisher(token, user.id, result.draft.source.scope.clientId)
        publisher = true
      } catch (error) {
        if (!(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 403)) throw error
      }
    }
    const templatePublication = { available: false, includedOverridePaths: [] as string[] }
    const saved = result.draft
    if (templatePublishEnabled(env) && saved?.state === 'structured' && saved.source.kind === 'template'
      && 'templateId' in saved && saved.templateId && result.owner?.kind !== 'campaign'
      && saved.projection.state === 'current' && saved.projectionRevisionId === saved.headRevisionId) {
      try {
        const scope = saved.source.scope.clientId
        await assertFreshDesignPublisher(token, user.id, scope)
        if (saved.source.moduleInstances.length) {
          templatePublication.includedOverridePaths = await transactionWithoutRetry(async db => reviewedOverridePaths(saved.source,
            await dependencyRecords(saved.source, db, {
              actorId: user.id,
              read: async clientId => { await assertFreshDesignAccess(token, user.id, clientId, 'read') },
              designer: async clientId => { await assertFreshDesignPublisher(token, user.id, clientId) },
              publisher: clientId => assertFreshDesignPublisher(token, user.id, clientId)
            })))
        }
        await assertFreshDesignPublisher(token, user.id, scope)
        templatePublication.available = true
      } catch (error) {
        if (!(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 403)) throw error
      }
    }
    return { ...lookup, templatePublication, campaignAuthoring: { contentImagesAvailable: campaignContentImages, available: campaignAvailable && (result.draft?.state !== 'structured' || result.draft.source.source.nativeArtifact === null) }, libraryAuthoring: { available: libraryAvailable, publisher }, designerAuthoring: {
      available, endpoint: '/api/email/design/designer' as const,
      capabilities: available && authoringSource ? designerCapabilities(authoringSource) : null
    } }
  } catch (error) {
    if (error && typeof error === 'object' && 'constraint' in error && DESIGN_REVISION_CONSTRAINTS.has(String(error.constraint))) rethrowLegacyDesignConflict(error)
    if (error instanceof DesignModuleError) throw createError({ statusCode: error.code.includes('STORAGE_UNAVAILABLE') ? 503 : 409, statusMessage: error.code })
    if (error instanceof ZodError || error instanceof EmailDesignActionError || error instanceof EmailDesignError)
      throw createError({ statusCode: 'code' in error && ['LIMIT_EXCEEDED', 'ACTION_LIMIT_EXCEEDED'].includes(error.code) ? 413 : 400, statusMessage: 'invalid_design_request' })
    if (error instanceof DesignHandoffError || error instanceof DesignRevisionError || error instanceof DesignReadError)
      throw createError({ statusCode: error.code === 'NOT_FOUND' ? 404 : error.code === 'DESIGNER_REQUIRED' ? 403 : 409, statusMessage: error.code })
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({ statusCode: 503, statusMessage: 'design_handoff_unavailable' })
  }
})
