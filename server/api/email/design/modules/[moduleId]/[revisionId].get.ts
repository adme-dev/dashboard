import { defineEventHandler, getRouterParam, getQuery } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import { readImmutableDesignModule, renderDraft } from '~~/server/utils/email-marketing/designModules'
import { resolveStoredDesignDependencies } from '~~/server/utils/email-marketing/designDependencies'
import { designLibrarySession, designLibraryHttpError } from '~~/server/utils/email-marketing/designLibraryHttp'

export default defineEventHandler(async (event) => {
  try {
    const { env, authority } = await designLibrarySession(event, false)
    return await transactionWithoutRetry(async (db) => {
      const selected = await readImmutableDesignModule(getRouterParam(event, 'moduleId') ?? '', getRouterParam(event, 'revisionId') ?? '', authority.read, db)
      await resolveStoredDesignDependencies(selected.design, db, (_id, scope) => authority.read(scope))
      await authority.read(selected.design.scope.clientId)
      if (getQuery(event).preview === '1') {
        const previewHtml = await renderDraft(createEmailRenderer(env), selected.design, null, null)
        await resolveStoredDesignDependencies(selected.design, db, (_id, scope) => authority.read(scope))
        await authority.read(selected.design.scope.clientId)
        return { ...selected, previewHtml }
      }
      return selected
    })
  } catch (error) { designLibraryHttpError(error) }
})
