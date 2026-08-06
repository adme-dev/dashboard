import { createError, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { uploadFile } from '~~/server/utils/storage'
import { execute } from '~~/server/utils/db'
import { enqueueBannerRender, BannerRenderError, type BannerFormat, type InsertJobRow } from '~~/server/utils/banner/renderJob'
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
      const queue = (event.context as {
        cloudflare?: { env?: { BANNER_RENDER_QUEUE?: { send: (message: unknown) => Promise<void> } } }
      }).cloudflare?.env?.BANNER_RENDER_QUEUE
      if (!queue) throw createError({ statusCode: 503, statusMessage: 'MP4 export is not enabled yet (render queue unavailable).' })
      return await enqueueBannerRender(
        { projectId, formats, fps, quality: quality === 2 ? 2 : 1, crf, userId: user.id },
        {
          genId,
          putSourceHtml: async (key, html) => { await uploadFile(Buffer.from(html, 'utf8'), key, 'text/html') },
          insertJob: async (r: InsertJobRow) => {
            await execute(
              `INSERT INTO banner_render_jobs (id, project_id, format_key, width, height, fps, crf, quality, source_r2_key, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [r.id, r.project_id, r.format_key, r.width, r.height, r.fps, r.crf, r.quality, r.source_r2_key, r.created_by]
            )
          },
          sendQueue: async (msg) => {
            await markDispatched()
            await queue.send(msg)
          }
        }
      )
    })
    return { jobIds }
  } catch (e) {
    if (e instanceof BannerRenderError) throw createError({ statusCode: 400, statusMessage: e.message, data: { findings: e.findings ?? [] } })
    throw e
  }
})
