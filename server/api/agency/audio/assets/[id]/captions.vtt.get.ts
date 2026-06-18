import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { transcriptToSingleCueVtt } from '~~/server/utils/video/captions'

function safeFilename(value: string | null | undefined): string {
  const base = (value || 'voiceover-captions')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${base || 'voiceover-captions'}.vtt`
}

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Asset id is required' })

  const row = await queryOne<{
    id: string
    kind: string
    title: string | null
    prompt: string | null
    duration_sec: string | number | null
  }>(
    `SELECT id, kind, title, prompt, duration_sec FROM audio_assets WHERE id = $1`,
    [id]
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Audio asset not found' })
  if (row.kind !== 'voiceover') throw createError({ statusCode: 400, statusMessage: 'Captions are only available for voiceover assets' })
  if (!row.prompt?.trim()) throw createError({ statusCode: 404, statusMessage: 'Voiceover script is not available' })

  const durationSec = row.duration_sec != null ? Number(row.duration_sec) : null
  setHeader(event, 'content-type', 'text/vtt; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="${safeFilename(row.title)}"`)
  return transcriptToSingleCueVtt(row.prompt, Number.isFinite(durationSec) ? durationSec : null)
})
