import { createError, defineEventHandler, getRouterParam } from 'h3'
import { executeDesignBrand } from '~~/server/utils/email-marketing/designBrand'
import { designBrandSession } from '~~/server/utils/email-marketing/designBrandHttp'
import { designLibraryHttpError, readBoundedJson } from '~~/server/utils/email-marketing/designLibraryHttp'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import { DesignBrandRequestSchema } from '~~/shared/emailRendering/designBrand'

export default defineEventHandler(async (event) => {
  try {
    const { env, authority } = await designBrandSession(event, true)
    const request = DesignBrandRequestSchema.parse(await readBoundedJson(event))
    if (request.draftId !== getRouterParam(event, 'id') || request.command !== 'set-design-lock') throw createError({ statusCode: 400, statusMessage: 'invalid_lock_target' })
    return await executeDesignBrand(request, authority, createEmailRenderer(env))
  } catch (error) { designLibraryHttpError(error) }
})
