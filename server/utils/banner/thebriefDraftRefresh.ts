import { createError } from 'h3'
import { z } from 'zod'
import { parseTheBriefPackage, sameImportedCanvas } from '~~/app/utils/thebrief-import'

// The package parser is pure at module load; browser File/atob helpers are never called here.
const requestSchema = z.object({
  clientId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  source: z.object({
    designHash: z.string().regex(/^[\w-]+$/).max(100), sha256: z.string().regex(/^[a-f0-9]{64}$/),
    folder: z.string().max(250), duration: z.number().positive().max(300), loopCount: z.number().int().min(0).max(1000)
  }).strict(),
  canvasData: z.record(z.string(), z.unknown())
}).strict()

export interface RefreshDb {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>
}
interface ImportedDraftRow extends Record<string, unknown> {
  id: string
  clientId: string
  status: string
  reviewStatus: string
  tags: string[] | null
  canvasData: unknown
  updatedAt: string | Date
}
const conflict = (statusMessage: string): never => {
  throw createError({ statusCode: 409, statusMessage })
}
const revisionTime = (value: string | Date) => new Date(value).getTime()
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}

/** Validate native data using the same strict parser as prepared files, without accepting binary uploads. */
export function readTheBriefDraftRefresh(body: unknown) {
  try {
    const input = requestSchema.parse(body)
    const canvas = structuredClone(input.canvasData) as Record<string, { layers?: Array<{ src?: unknown, type?: unknown }> }>
    const urls: string[] = []
    for (const board of Object.values(canvas)) {
      if (!board || !Array.isArray(board.layers)) throw new Error('Invalid artboard')
      for (const layer of board.layers) {
        if (layer.src === undefined) continue
        if (typeof layer.src !== 'string' || layer.src.length > 2048 || !/^https:\/\//.test(layer.src)) throw new Error('Managed asset URL required')
        if (!urls.includes(layer.src)) urls.push(layer.src)
        layer.src = `./media/asset-${urls.indexOf(layer.src)}.png`
      }
    }
    // Synthetic local references let the shared parser check geometry, tracks, effects and timing.
    // The real managed URLs are then restored, and independently checked against client-owned DB assets.
    const parsed = parseTheBriefPackage({
      kind: 'xeroflow-thebrief-import', version: 1, name: 'Draft refresh', source: input.source,
      canvasData: canvas, warnings: [], fonts: [],
      assets: urls.map((_url, i) => ({ path: `./media/asset-${i}.png`, fileName: `asset-${i}.png`, sha256: '0'.repeat(64), base64: '', mimeType: 'image/png' }))
    })
    for (const board of Object.values(parsed.canvasData)) for (const layer of board.layers) {
      if (layer.src) layer.src = urls[Number(/^\.\/media\/asset-(\d+)\.png$/.exec(layer.src)![1])]!
    }
    return { ...input, clientId: input.clientId.toLowerCase(), canvasData: parsed.canvasData, assetUrls: urls }
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid TheBrief draft update package' })
  }
}
export type TheBriefDraftRefresh = ReturnType<typeof readTheBriefDraftRefresh>

/** Caller owns the transaction. Snapshot, idempotence record and canvas change must commit together. */
export async function refreshTheBriefDraft(db: RefreshDb, id: string, actorId: string, input: TheBriefDraftRefresh) {
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(input)))), b => b.toString(16).padStart(2, '0')).join('')
  const result = await db.query<ImportedDraftRow>(`
    SELECT id, name, client_id AS "clientId", folder_id AS "folderId", canvas_data AS "canvasData",
      thumbnail_url AS "thumbnailUrl", status, review_status AS "reviewStatus", tags,
      created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM banner_projects WHERE id = $1 FOR UPDATE
  `, [id])
  const project = result.rows[0]
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  const tags: string[] = project.tags ?? []
  if (project.clientId !== input.clientId) conflict('Project client changed; reopen the import before updating')
  if (project.status !== 'draft' || project.reviewStatus !== 'draft' || !tags.includes('import:needs-review')) conflict('Only unreviewed imported drafts can be updated')
  if (!tags.includes('source:thebrief')
    || tags.filter(tag => /^source-sha256:/i.test(tag)).length !== 1
    || !tags.some(tag => tag.toLowerCase() === `source-sha256:${input.source.sha256}`)
    || tags.filter(tag => /^source-design:/i.test(tag)).length !== 1
    || !tags.includes(`source-design:${input.source.designHash}`)
    || !tags.includes(`source-duration:${input.source.duration}`)
    || !tags.includes(`source-loops:${input.source.loopCount}`)) conflict('The prepared package does not match this imported source')
  const markerPrefix = `import-refresh:${digest}:`
  const marker = tags.find(tag => tag.startsWith(markerPrefix))
  if (marker) {
    if (revisionTime(marker.slice(markerPrefix.length)) !== revisionTime(project.updatedAt) || !sameImportedCanvas(project.canvasData, input.canvasData)) conflict('The draft was edited after this update; reopen it before continuing')
    return { ...project, refreshed: false }
  }
  if (revisionTime(project.updatedAt) !== revisionTime(input.expectedUpdatedAt)) conflict('The draft changed while this update was being prepared; reopen it to review the latest revision')
  const client = await db.query('SELECT id FROM agency_clients WHERE id = $1 AND is_active = TRUE FOR SHARE', [input.clientId])
  if (!client.rows.length) conflict('The import client is no longer active')
  if (input.assetUrls.length) {
    const assets = await db.query<{ url: string }>('SELECT url FROM banner_assets WHERE client_id = $1 AND url = ANY($2::text[]) FOR SHARE', [input.clientId, input.assetUrls])
    const owned = new Set(assets.rows.map(asset => asset.url))
    if (input.assetUrls.some(url => !owned.has(url))) throw createError({ statusCode: 400, statusMessage: 'All imported assets must belong to the selected client' })
  }
  if (sameImportedCanvas(project.canvasData, input.canvasData)) return { ...project, refreshed: false }
  await db.query(`
    INSERT INTO banner_versions (project_id, version_number, canvas_data, label, created_by)
    SELECT $1, COALESCE(MAX(version_number), 0) + 1, $2::jsonb, $3, $4 FROM banner_versions WHERE project_id = $1
  `, [id, JSON.stringify(project.canvasData), 'Before TheBrief imported draft update', actorId])
  // Millisecond precision matches the public API and ensures this revision differs from its predecessor.
  const updatedAt = new Date(Math.max(Date.now(), revisionTime(project.updatedAt) + 1)).toISOString()
  const updated = await db.query<ImportedDraftRow>(`
    UPDATE banner_projects SET canvas_data = $2::jsonb, tags = $3::text[], thumbnail_url = NULL, updated_at = $4::timestamptz
    WHERE id = $1
    RETURNING id, name, client_id AS "clientId", folder_id AS "folderId", canvas_data AS "canvasData",
      thumbnail_url AS "thumbnailUrl", status, review_status AS "reviewStatus", tags,
      created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
  `, [id, JSON.stringify(input.canvasData), [...tags.filter(tag => !tag.startsWith('import-refresh:')), `${markerPrefix}${updatedAt}`], updatedAt])
  if (!updated.rows[0]) throw new Error('Draft update did not persist')
  return { ...updated.rows[0], refreshed: true }
}
