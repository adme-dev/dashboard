import { defineEventHandler, readBody } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { renderBannerExports } from '~~/server/utils/banner/exportRendering'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  return renderBannerExports(event, user, await readBody(event), 'gif')
})
