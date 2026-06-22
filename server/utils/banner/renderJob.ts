export type BannerFormat = { key: string, html: string, width: number, height: number }
export type BannerRenderInput = { projectId: string, formats: BannerFormat[], fps: number, quality: 1 | 2, crf: number, userId: string }
export type BannerJobRow = {
  id: string, project_id: string, format_key: string, width: number, height: number,
  fps: number, crf: number, quality: number, source_r2_key: string,
  status: string, url: string | null, file_size: number | null, error: string | null,
}
export type InsertJobRow = {
  id: string, project_id: string, format_key: string, width: number, height: number,
  fps: number, crf: number, quality: number, source_r2_key: string, created_by: string,
}
export type EnqueueDeps = {
  genId: () => string
  putSourceHtml: (key: string, html: string) => Promise<void>
  insertJob: (row: InsertJobRow) => Promise<void>
  sendQueue: (msg: { jobId: string }) => Promise<void>
}

export const CAPS = { MAX_FORMATS: 10, MAX_DIMENSION: 2000 } as const

export class BannerRenderError extends Error {
  code: 'bad_request'
  constructor(message: string) { super(message); this.code = 'bad_request' }
}

export function clampRenderParams(fps: number, crf: number, quality: number): { fps: number, crf: number, quality: 1 | 2 } {
  return {
    fps: Math.min(60, Math.max(12, Math.round(fps || 30))),
    crf: Math.min(51, Math.max(0, Math.round(crf ?? 23))),
    quality: quality > 1 ? 2 : 1,
  }
}

export async function enqueueBannerRender(input: BannerRenderInput, deps: EnqueueDeps): Promise<{ jobIds: string[] }> {
  if (!input.projectId) throw new BannerRenderError('projectId is required')
  if (!input.formats?.length) throw new BannerRenderError('formats array is required')
  if (input.formats.length > CAPS.MAX_FORMATS) throw new BannerRenderError(`Max ${CAPS.MAX_FORMATS} formats per export`)
  const { fps, crf, quality } = clampRenderParams(input.fps, input.crf, input.quality)

  const jobIds: string[] = []
  for (const f of input.formats) {
    if (f.width > CAPS.MAX_DIMENSION || f.height > CAPS.MAX_DIMENSION) continue // skip oversize (mirrors current loop)
    const id = deps.genId()
    const source_r2_key = `banner-render-jobs/${id}/source.html`
    await deps.putSourceHtml(source_r2_key, f.html)
    await deps.insertJob({ id, project_id: input.projectId, format_key: f.key, width: f.width, height: f.height, fps, crf, quality, source_r2_key, created_by: input.userId })
    await deps.sendQueue({ jobId: id })
    jobIds.push(id)
  }
  if (!jobIds.length) throw new BannerRenderError('No renderable formats (all exceeded the size limit)')
  return { jobIds }
}

export function projectJobStatus(rows: BannerJobRow[]): { jobId: string, formatKey: string, status: string, url: string | null, fileSize: number | null, error: string | null }[] {
  return rows.map(r => ({ jobId: r.id, formatKey: r.format_key, status: r.status, url: r.url ?? null, fileSize: r.file_size ?? null, error: r.error ?? null }))
}
