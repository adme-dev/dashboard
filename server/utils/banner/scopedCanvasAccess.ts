import { createError } from 'h3'
import type { Pool } from '@neondatabase/serverless'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { hasScopedCanvas, collectScopedCanvasLocators, collectScopedCanvasSources } from '../../../shared/bannerScopedCanvas'
import { dissectionSourceSchema, dissectionIngestionSchema } from '../../../shared/bannerDissectionIngestion'
import { dissectionDeliverySchema, parseScopedDissectionAssetLocator, scopedDissectionAssetKey } from '../../../shared/bannerDissectionDelivery'
import { assertDissectionAccess, resolveDissectionContext, type DissectionAccessDb, type DissectionAccessMode } from './dissectionAccess'

const denied = () => createError({ statusCode: 403, statusMessage: 'No access to protected artwork' })
interface SourceRow { job_id: string, user_id: string, manifest: any }
interface Target { clientId: string | null }
function parsedCanvas(canvas: unknown): unknown {
  if (typeof canvas !== 'string') return canvas
  try { return JSON.parse(canvas) } catch { throw denied() }
}
function dependencies(canvas: unknown) {
  try {
    const value = Array.isArray(canvas) ? canvas.map(parsedCanvas) : parsedCanvas(canvas)
    const sources = collectScopedCanvasSources(value)
    const refs = collectScopedCanvasLocators(value).map(locator => ({ ...parseScopedDissectionAssetLocator(locator)!, locator }))
    const jobs = [...new Set([...sources.map(s => s.jobId), ...refs.map(r => r.jobId)])].sort()
    if (!jobs.length || jobs.length > 8) throw denied()
    return { sources, refs, jobs }
  } catch { throw denied() }
}

/** Reject managed saves/snapshots that erase source lineage, including deleted formats. */
export function assertScopedCanvasLineage(previous: unknown, next: unknown): void {
  if (!hasScopedCanvas(previous)) return
  const before = dependencies(previous)
  const conflict = () => createError({ statusCode: 409, statusMessage: 'Keep the protected source artboard and its source marker when saving. Reload before removing protected artwork.' })
  let after: ReturnType<typeof dependencies>
  try { after = dependencies(next) } catch { throw conflict() }
  for (const source of before.sources) {
    if (!after.sources.some(s => s.jobId === source.jobId && s.sourceSha256 === source.sourceSha256)) throw conflict()
  }
  // Historic locators without markers still carry immutable source identity.
  for (const ref of before.refs) {
    if (!after.jobs.includes(ref.jobId)) throw conflict()
  }
}

/** DB-only authority. Call before other locks in the transaction. No R2/URL reads. */
export async function assertScopedCanvasAccessInTransaction(
  db: DissectionAccessDb, actorId: string, canvas: unknown, projectId?: string,
  mode: DissectionAccessMode = 'read', target?: Target,
): Promise<void> {
  if (!hasScopedCanvas(canvas)) return
  const { sources, refs, jobs } = dependencies(canvas)
  const rows: SourceRow[] = []
  // All source locks precede actor/project locks, including multi-source canvases.
  for (const jobId of jobs) {
    const row = (await db.query<SourceRow>('SELECT job_id, user_id, manifest FROM banner_dissections WHERE job_id = $1 FOR UPDATE', [jobId])).rows[0]
    if (!row || row.job_id !== jobId || row.user_id !== actorId) throw denied()
    rows.push(row)
  }
  const sourceClients: (string | null)[] = []
  for (const row of rows) {
    await assertDissectionAccess(db, actorId, row, mode)
    const source = dissectionSourceSchema.safeParse(row.manifest?.source)
    const ingestion = dissectionIngestionSchema.safeParse(row.manifest?.ingestion)
    if (!source.success || !ingestion.success || ingestion.data.owner.kind === 'user'
      || ingestion.data.owner.userId !== actorId) throw denied()
    sourceClients.push(ingestion.data.owner.clientId)
    const marker = sources.find(s => s.jobId === row.job_id)
    if (marker && marker.sourceSha256 !== source.data.sha256) throw denied()
    const jobRefs = refs.filter(ref => ref.jobId === row.job_id)
    if (!jobRefs.length) continue
    const registry = dissectionDeliverySchema.safeParse(row.manifest?.delivery)
    if (!registry.success) throw denied()
    for (const ref of jobRefs.sort((a, b) => a.assetId.localeCompare(b.assetId))) {
      const entry = registry.data.assets[ref.assetId]
      if (!entry || entry.key !== scopedDissectionAssetKey(row.job_id, entry.attemptId, ref.assetId)) throw denied()
      const asset = (await db.query<any>(`SELECT id, r2_key, uploaded_by, client_id, mime_type, file_size, url
        FROM banner_assets WHERE id = $1 FOR SHARE`, [ref.assetId])).rows[0]
      if (!asset || asset.id !== ref.assetId || asset.r2_key !== entry.key || asset.uploaded_by !== actorId
        || asset.client_id !== ingestion.data.owner.clientId || asset.mime_type !== entry.mimeType
        || asset.file_size !== entry.byteLength || asset.url !== ref.locator) throw denied()
    }
  }
  if (projectId) {
    const context = await resolveDissectionContext(db, actorId, { projectId }, mode)
    if (context.owner.kind !== 'project') throw denied()
    const targetClientId = context.owner.clientId
    if (sourceClients.some(clientId => clientId !== targetClientId)) throw denied()
  }
  if (target) {
    await resolveDissectionContext(db, actorId, target.clientId ? { clientId: target.clientId } : {}, mode)
    if (sourceClients.some(clientId => clientId !== target.clientId)) throw denied()
  }
}

/** Callback runs once under the same source and scope locks; never do remote I/O inside it. */
export async function withScopedCanvasAccess<T>(
  actorId: string, canvas: unknown, projectId: string | undefined, mode: DissectionAccessMode,
  callback: (db: Pick<Pool, 'query'>) => Promise<T>, target?: Target,
): Promise<T> {
  return transactionWithoutRetry(async db => {
    await assertScopedCanvasAccessInTransaction(db, actorId, canvas, projectId, mode, target)
    return callback(db)
  })
}

export async function assertScopedCanvasAccess(
  actorId: string, canvas: unknown, projectId?: string, mode: DissectionAccessMode = 'read',
): Promise<void> {
  if (!hasScopedCanvas(canvas)) return
  await withScopedCanvasAccess(actorId, canvas, projectId, mode, async () => {})
}

/** Fence a preflight snapshot before any mutation; source locks must already be held. */
export async function assertScopedProjectUnchanged(db: DissectionAccessDb, projectId: string, observed: {
  canvasData: unknown, clientId: string | null, createdBy: string, updatedAt?: string | Date,
}): Promise<void> {
  const current = (await db.query<any>(`SELECT canvas_data AS "canvasData", client_id AS "clientId",
    created_by AS "createdBy", updated_at AS "updatedAt" FROM banner_projects WHERE id = $1 FOR UPDATE`, [projectId])).rows[0]
  if (!current || current.clientId !== observed.clientId || current.createdBy !== observed.createdBy
    || JSON.stringify(current.canvasData) !== JSON.stringify(observed.canvasData)
    || (observed.updatedAt !== undefined && new Date(current.updatedAt).getTime() !== new Date(observed.updatedAt).getTime())) {
    throw createError({ statusCode: 409, statusMessage: 'Artwork changed elsewhere. Reload before saving.' })
  }
}
