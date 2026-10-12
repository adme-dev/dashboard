import { defineEventHandler, getHeader, readBody } from 'h3'
import { authorizeNewsroom, newsroomConfig } from '~~/server/utils/newsroomSocialSource'
import { handleNewsroomSocial } from '~~/server/utils/newsroomSocial'

export default defineEventHandler(async (event) => {
  const config = newsroomConfig(event.context.cloudflare?.env)
  authorizeNewsroom(config, getHeader(event, 'x-newsroom-secret'))
  return handleNewsroomSocial(await readBody(event), config)
})
