import { setDesignBinned } from '~~/server/utils/banner/designBin'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!z.string().uuid().safeParse(id).success) throw createError({ statusCode: 400, statusMessage: 'Invalid design ID' })
  return setDesignBinned(event, id!, true)
})
