import { createError, defineEventHandler, getHeader, readBody } from 'h3'
import { assertStoryboardCallbackSecret, authorizeStoryboardRenderCallback, StoryboardCallbackSchema } from '~~/server/utils/video-storyboard/renderDispatch'

export default defineEventHandler(async (event) => {
  const secret = event.context.cloudflare?.env?.STORYBOARD_RENDER_SECRET ?? process.env.STORYBOARD_RENDER_SECRET
  assertStoryboardCallbackSecret(secret, getHeader(event, 'authorization'))
  const parsed = StoryboardCallbackSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid storyboard render callback' })
  return authorizeStoryboardRenderCallback(event, parsed.data)
})
