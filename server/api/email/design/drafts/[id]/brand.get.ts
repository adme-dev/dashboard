import { defineEventHandler, getRouterParam } from 'h3'
import { queryRowsFresh } from '~~/server/utils/db'
import { readDesignBrandOptions } from '~~/server/utils/email-marketing/designBrand'
import { designBrandSession } from '~~/server/utils/email-marketing/designBrandHttp'
import { designLibraryHttpError } from '~~/server/utils/email-marketing/designLibraryHttp'

export default defineEventHandler(async (event) => {
  try {
    const { authority } = await designBrandSession(event, false)
    return await readDesignBrandOptions(getRouterParam(event, 'id')!, authority, { query: async (sql, params) => ({ rows: await queryRowsFresh(sql, params) }) })
  } catch (error) { designLibraryHttpError(error) }
})
