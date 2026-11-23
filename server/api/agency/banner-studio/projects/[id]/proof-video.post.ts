import { z } from 'zod'
import { attachBannerProofVideo } from '~~/server/utils/banner/proofVideo'

const Body = z.object({ id: z.string().regex(/^[0-9a-f-]{36}:(reels_9x16|square_1x1|youtube_16x9)$/i), revision: z.string().regex(/^[0-9a-f]{64}$/) })
export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choose a current completed video render' })
  return attachBannerProofVideo(event, parsed.data)
})
