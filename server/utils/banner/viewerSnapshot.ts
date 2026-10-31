import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import { queryOneFresh } from '~~/server/utils/db'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { readStoredObject, uploadFile, type R2BucketBinding } from '~~/server/utils/storage'

const MAX_BYTES = 16 * 1024 * 1024

// Postgres JSONB does not preserve object-key order. Hash canonical content, not
// response serialization, so the viewer can locate the exact saved revision.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function bannerViewerSnapshot(project: { id: string, name: string, canvasData: unknown, clientId?: string | null }) {
  const document = { schema: 1, projectId: project.id, name: project.name, canvasData: project.canvasData }
  const bytes = Buffer.from(canonical(document))
  if (bytes.length > MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'Banner is too large for the saved viewer' })
  const revision = createHash('sha256').update(bytes).digest('hex')
  // Client scope is authorized response metadata, not immutable artwork content.
  // Keep the original schema-1 hash/key so existing saved viewers remain readable.
  return { document, bytes, revision, clientId: project.clientId ?? null, key: `banner-snapshots/${project.id}/${revision}.json` }
}

export async function authorizedBannerSnapshot(event: H3Event, write = false) {
  const user = write ? await requireWriteAccess(event) : await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid project ID' })
  const project = await queryOneFresh<{ id: string, name: string, canvasData: unknown, clientId: string | null, createdBy: string }>(
    'SELECT id, name, canvas_data AS "canvasData", client_id AS "clientId", created_by AS "createdBy" FROM banner_projects WHERE id = $1', [id])
  if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  if (project.clientId) await requireSocialClientAccess(event, project.clientId)
  else if (project.createdBy !== user.id && !hasAllSocialClientAccess(user)) throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
  return bannerViewerSnapshot(project)
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
  return { ...JSON.parse(bytes.toString('utf8')), clientId: snapshot.clientId, revision: snapshot.revision }
}
