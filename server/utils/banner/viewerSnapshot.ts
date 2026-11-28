import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import { queryOneFresh } from '~~/server/utils/db'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { hasAllBannerClientAccess, requireBannerClientAccess } from '~~/server/utils/banner/clientAccess'
import { readStoredObject, uploadFile, type R2BucketBinding } from '~~/server/utils/storage'

const MAX_BYTES = 16 * 1024 * 1024

// Postgres JSONB does not preserve object-key order. Hash canonical content, not
// response serialization, so the viewer can locate the exact saved revision.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function bannerViewerSnapshot(project: { id: string, name: string, canvasData: unknown, clientId?: string | null, clientName?: string | null }) {
  const document = { schema: 1, projectId: project.id, name: project.name, canvasData: project.canvasData }
  const bytes = Buffer.from(canonical(document))
  if (bytes.length > MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'Banner is too large for the saved viewer' })
  const revision = createHash('sha256').update(bytes).digest('hex')
  // Client scope is authorized response metadata, not immutable artwork content.
  // Keep the original schema-1 hash/key so existing saved viewers remain readable.
  return { document, bytes, revision, clientId: project.clientId ?? null, clientName: project.clientName ?? null, key: `banner-snapshots/${project.id}/${revision}.json` }
}

interface PreviewProject {
  id: string
  name: string
  clientId: string | null
  clientName: string | null
  createdBy: string
  canvasData?: unknown
  posterRevision?: string
}

async function authorizedProject(event: H3Event, write: boolean, revisionOnly: boolean) {
  const user = write ? await requireWriteAccess(event) : await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  // A row version changes even when an import preserves updated_at. Scoped font
  // versions also cover legacy faces resolved by family, including new or removed faces.
  const artwork = revisionOnly
    ? `md5(concat_ws(':', p.xmin::text, p.updated_at::text, p.client_id::text,
         (SELECT string_agg(a.id::text || '/' || a.xmin::text, ',' ORDER BY a.id)
          FROM banner_assets a WHERE 'font' = ANY(a.tags) AND (a.client_id IS NULL OR a.client_id = p.client_id))
       )) AS "posterRevision"`
    : 'p.canvas_data AS "canvasData"'
  const project = await queryOneFresh<PreviewProject>(
    `SELECT p.id, p.name, ${artwork}, p.client_id AS "clientId", c.name AS "clientName", p.created_by AS "createdBy"
     FROM banner_projects p LEFT JOIN agency_clients c ON c.id = p.client_id WHERE p.id = $1 AND p.binned_at IS NULL`, [id])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (project.clientId) await requireBannerClientAccess(event, project.clientId)
  else if (project.createdBy !== user.id && !await hasAllBannerClientAccess(user)) throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
  return project
}

export async function authorizedPosterRevision(event: H3Event) {
  const project = await authorizedProject(event, false, true)
  return { id: project.id, revision: project.posterRevision! }
}

export async function authorizedBannerSnapshot(event: H3Event, write = false) {
  const project = await authorizedProject(event, write, false)
  return bannerViewerSnapshot({ ...project, canvasData: project.canvasData })
}

function requestBucket(event: H3Event): R2BucketBinding | undefined {
  const bucket = event.context.cloudflare?.env?.MEDIA_BUCKET
  if (event.context.cloudflare && !bucket) throw createError({ statusCode: 503, statusMessage: 'Viewer storage is unavailable' })
  return bucket
}

export async function storeBannerSnapshot(event: H3Event, snapshot: ReturnType<typeof bannerViewerSnapshot>) {
  const bucket = requestBucket(event)
  if (bucket) {
    await bucket.put(snapshot.key, new Uint8Array(snapshot.bytes), { httpMetadata: { contentType: 'application/json' } })
    const stored = await bucket.head(snapshot.key)
    if (stored?.size !== snapshot.bytes.length) throw createError({ statusCode: 503, statusMessage: 'Viewer snapshot could not be verified' })
  } else {
    await uploadFile(snapshot.bytes, snapshot.key, 'application/json')
  }
}

export async function readBannerSnapshot(event: H3Event, snapshot: ReturnType<typeof bannerViewerSnapshot>) {
  const bucket = requestBucket(event)
  const object = bucket?.get ? await bucket.get(snapshot.key) : await readStoredObject(snapshot.key)
  if (!object) throw createError({ statusCode: 409, statusMessage: 'Save this project in the editor to update its viewer' })
  if (object.size !== snapshot.bytes.length) throw createError({ statusCode: 503, statusMessage: 'Viewer snapshot is incomplete' })
  const bytes = Buffer.from(await new Response(object.body).arrayBuffer())
  if (createHash('sha256').update(bytes).digest('hex') !== snapshot.revision) throw createError({ statusCode: 503, statusMessage: 'Viewer snapshot could not be verified' })
  return { ...JSON.parse(bytes.toString('utf8')), clientId: snapshot.clientId, clientName: snapshot.clientName, revision: snapshot.revision }
}
