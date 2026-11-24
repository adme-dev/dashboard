import { setDesignBinned } from '~~/server/utils/banner/designBin'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse)
  return setDesignBinned(event, id, false)
})
