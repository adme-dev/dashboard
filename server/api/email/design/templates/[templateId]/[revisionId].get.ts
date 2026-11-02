import { defineEventHandler, getRouterParam } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { readImmutableDesignTemplate } from '~~/server/utils/email-marketing/designTemplates'
import { designLibrarySession, designLibraryHttpError } from '~~/server/utils/email-marketing/designLibraryHttp'

export default defineEventHandler(async (event) => {
  try {
    const { authority } = await designLibrarySession(event, false)
    return await transactionWithoutRetry(db =>
      readImmutableDesignTemplate(
        getRouterParam(event, 'templateId') ?? '',
        getRouterParam(event, 'revisionId') ?? '',
        authority,
        db
      )
    )
  } catch (error) {
    designLibraryHttpError(error)
  }
})
