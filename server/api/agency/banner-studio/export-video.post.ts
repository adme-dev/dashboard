import { createError, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { enqueueBannerRender, BannerRenderError, type BannerFormat } from '~~/server/utils/banner/renderJob'
import { buildBannerRenderEnqueueDeps } from '~~/server/utils/banner/renderEnqueue'
import { executeGodModeBannerRender } from '~~/server/utils/banner/godModeRender'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const { projectId, formats, fps = 30, quality = 1, crf = 23 } = body as {
    projectId: string
    formats: BannerFormat[]
    fps?: number
    quality?: 1 | 2
    crf?: number
  }

  try {
    const { jobIds } = await executeGodModeBannerRender(event, formats?.length ?? 0, async (genId, markDispatched) => {
      return await enqueueBannerRender(
        { projectId, formats, fps, quality: quality === 2 ? 2 : 1, crf, userId: user.id },
        buildBannerRenderEnqueueDeps(event, { genId, markDispatched })
      )
    })
    return { jobIds }
  } catch (e) {
    if (e instanceof BannerRenderError) throw createError({ statusCode: 400, statusMessage: e.message, data: { findings: e.findings ?? [] } })
    throw e
  }
})
