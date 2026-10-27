import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { BANNER_RENDER_LIMITS } from '#shared/bannerRenderContract'
import { hasScopedDissectionReferences, collectScopedCanvasSources, SCOPED_DISSECTION_EXCLUSION } from '#shared/bannerScopedCanvas'
import { parseScopedDissectionAssetLocator } from '#shared/bannerDissectionDelivery'
import { dissectionOwnerSchema, dissectionSourceSchema, dissectionIngestionSchema } from '#shared/bannerDissectionIngestion'
import { getAppUrl } from '~~/server/utils/appUrl'
import { queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { assertDissectionAccess, resolveDissectionContext } from '~~/server/utils/banner/dissectionAccess'
import { resolveScopedDissectionAsset } from '~~/server/utils/banner/dissectionDelivery'
import { buildBannerHTML } from '~~/server/utils/banner/htmlBuilder'
import { resolveBannerFormat } from '~~/app/utils/banner-constants'

const MAX_METADATA_BYTES = 1800
const MAX_REFERENCES = 64
const MAX_JOBS = 8
const bytes = (value: string) => new TextEncoder().encode(value).byteLength
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const instant = z.string().datetime()
const provenanceSchema = z.object({
  version: z.literal(1), projectId: z.string().uuid(), sourceRevision: instant,
  target: z.object({ owner: dissectionOwnerSchema, sessionsInvalidatedAt: instant.nullable() }).strict(),
  dependencies: z.array(z.object({ jobId: z.string().uuid(), sourceSha256: digest }).strict()).min(1).max(MAX_JOBS),
  exportId: z.string().uuid(), outputSha256: digest,
}).strict()
type Provenance = z.infer<typeof provenanceSchema>
export type ScopedExportIdentity = Omit<Provenance, 'exportId' | 'outputSha256'>
export interface ScopedProject { canvas_data?: unknown, updated_at?: string | Date }
function fail(statusCode = 400, statusMessage = 'Invalid protected artwork export'): never {
  throw createError({ statusCode, statusMessage })
}
function stale(): never { fail(409, 'Save your artwork and reload the current saved revision before exporting.') }
function json(value: unknown): any {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { fail() }
}
function revision(value: unknown): string {
  const date = new Date(value as string)
  if (!Number.isFinite(date.getTime())) stale()
  return date.toISOString()
}

export function assertNoScopedDissectionReferences(value: unknown): void {
  if (hasScopedDissectionReferences(value)) fail(409, SCOPED_DISSECTION_EXCLUSION)
}
/** Saved source locators, never optional caller provenance, select the restriction. */
export async function assertProjectAllowsUnprotectedFlow(projectId: unknown, supplied?: unknown): Promise<void> {
  assertNoScopedDissectionReferences(supplied)
  if (typeof projectId !== 'string' || !z.string().uuid().safeParse(projectId).success) fail()
  const project = await queryOneFresh<{ canvas_data: unknown }>('SELECT canvas_data FROM banner_projects WHERE id = $1', [projectId])
  if (!project) fail(404, 'Project not found')
  assertNoScopedDissectionReferences(project.canvas_data)
}

/** Each fresh check locks jobs before their authority; no transaction spans R2/render I/O. */
export async function recheckScopedExport(actorId: string, identity: ScopedExportIdentity, checkRevision: boolean): Promise<void> {
  await transactionWithoutRetry(async db => {
    const jobs = []
    // Acquire every source lock before actor/project locks, matching canvas mutations.
    for (const dependency of [...identity.dependencies].sort((a, b) => a.jobId.localeCompare(b.jobId))) {
      const job = (await db.query('SELECT user_id, manifest FROM banner_dissections WHERE job_id = $1 FOR SHARE', [dependency.jobId])).rows[0]
      if (!job) fail(403, 'Protected artwork is unavailable')
      jobs.push({ job, dependency })
    }
    const mode = checkRevision ? 'write' : 'read'
    for (const { job, dependency } of jobs) {
      await assertDissectionAccess(db, actorId, job, mode)
      const manifest = json(job.manifest)
      const source = dissectionSourceSchema.safeParse(manifest?.source)
      const ingestion = dissectionIngestionSchema.safeParse(manifest?.ingestion)
      if (!source.success || !ingestion.success || ingestion.data.owner.kind === 'user'
        || ingestion.data.owner.userId !== actorId || source.data.sha256 !== dependency.sourceSha256
        || identity.target.owner.kind !== 'project' || ingestion.data.owner.clientId !== identity.target.owner.clientId) {
        fail(403, 'Protected artwork is unavailable')
      }
    }
    const target = await resolveDissectionContext(db, actorId, { projectId: identity.projectId }, mode)
    if (JSON.stringify(target) !== JSON.stringify(identity.target)) fail(403, 'Project ownership changed')
    if (checkRevision) {
      const project = (await db.query('SELECT updated_at FROM banner_projects WHERE id = $1 FOR SHARE', [identity.projectId])).rows[0]
      if (!project || revision(project.updated_at) !== identity.sourceRevision) stale()
    }
  })
}

export function scopedExportMetadata(identity: ScopedExportIdentity, exportId: string, outputSha256: string): Record<string, string> {
  const provenance = JSON.stringify(provenanceSchema.parse({ ...identity, exportId, outputSha256 }))
  if (bytes(provenance) > MAX_METADATA_BYTES) fail(413, 'Too many protected source dependencies')
  return { provenance }
}
export function parseScopedExportProvenance(metadata: unknown, exportId: string, projectId: string): Provenance {
  const raw = (metadata as { provenance?: unknown } | undefined)?.provenance
  if (typeof raw !== 'string' || bytes(raw) > MAX_METADATA_BYTES) fail(503, 'Protected export provenance unavailable')
  let parsed: ReturnType<typeof provenanceSchema.safeParse>
  try { parsed = provenanceSchema.safeParse(JSON.parse(raw)) } catch { fail(503, 'Protected export provenance unavailable') }
  if (!parsed.success || parsed.data.exportId !== exportId || parsed.data.projectId !== projectId
    || new Set(parsed.data.dependencies.map(item => item.jobId)).size !== parsed.data.dependencies.length
    || parsed.data.target.owner.kind !== 'project' || parsed.data.target.owner.projectId !== projectId) fail(503, 'Protected export provenance unavailable')
  return parsed.data
}

export async function prepareScopedExport(event: H3Event, actorId: string, input: any, observed: ScopedProject, mode: 'image' | 'gif' | 'html') {
  if (!hasScopedDissectionReferences(observed.canvas_data)) {
    assertNoScopedDissectionReferences(input)
    return null
  }
  const projectId = z.string().uuid().safeParse(input.projectId)
  if (!projectId.success) fail()
  input = { ...input, projectId: projectId.data.toLowerCase() }
  if (typeof input.sourceRevision !== 'string') stale()
  const sourceRevision = revision(input.sourceRevision)
  if (sourceRevision !== revision(observed.updated_at)) stale()
  if (!Array.isArray(input.formats) || input.formats.length < 1 || input.formats.length > 25) fail()
  const keys = input.formats.map((item: any) => item?.key)
  if (keys.some((key: unknown) => typeof key !== 'string' || !key || key.length > 50) || new Set(keys).size !== keys.length) fail()
  const snapshot = await transactionWithoutRetry(async db => {
    const target = await resolveDissectionContext(db, actorId, { projectId: input.projectId }, 'write')
    const project = (await db.query('SELECT canvas_data, updated_at FROM banner_projects WHERE id = $1 FOR SHARE', [input.projectId])).rows[0]
    if (!project || revision(project.updated_at) !== sourceRevision) stale()
    return { target, canvas: json(project.canvas_data) }
  })
  const canvas = structuredClone(snapshot.canvas)
  if (!canvas || typeof canvas !== 'object' || Array.isArray(canvas)) fail()
  const references = new Set<string>()
  const occurrences = new Map<string, number>()
  let savedStringBytes = 0
  const fontFamilies = new Set<string>()
  let nodes = 0
  const walk = (value: any, replace?: Map<string, string>, depth = 0): any => {
    if (++nodes > 20000 || depth > 32) fail(413, 'Artwork exceeds export limits')
    if (!replace && typeof value === 'string') {
      savedStringBytes += bytes(value)
      if (savedStringBytes > BANNER_RENDER_LIMITS.MAX_REQUEST_HTML_BYTES) fail(413, 'Artwork exceeds export limits')
    }
    if (typeof value === 'string' && hasScopedDissectionReferences(value)) {
      if (!parseScopedDissectionAssetLocator(value)) fail()
      references.add(value)
      if (!replace) occurrences.set(value, (occurrences.get(value) || 0) + 1)
      if (references.size > MAX_REFERENCES) fail(413, 'Too many protected image references')
      return replace ? replace.get(value) || fail() : value
    }
    if (Array.isArray(value)) return value.map(item => walk(item, replace, depth + 1))
    if (value && typeof value === 'object') for (const key of Object.keys(value)) {
      if (key === 'fontFamily' && typeof value[key] === 'string') fontFamilies.add(value[key])
      if (key === 'textTexture' && hasScopedDissectionReferences(value[key])) fail(409, 'Protected text textures are unavailable for export')
      if (/^feed(?:Url|Bindings|Override)/i.test(key) && value[key] && JSON.stringify(value[key]) !== '{}') fail(409, 'Remove dynamic feed overrides before exporting protected artwork')
      value[key] = walk(value[key], replace, depth + 1)
    }
    return value
  }
  // Authorize every saved source, including nonselected formats, before any rendering.
  walk(canvas)
  let sources: ReturnType<typeof collectScopedCanvasSources>
  try { sources = collectScopedCanvasSources(canvas) } catch { fail() }
  if (!references.size && !sources.length) stale()
  const embedded = new Map<string, string>()
  const dependencies = new Map<string, string>(sources.map(source => [source.jobId, source.sourceSha256]))
  const allJobIds = [...new Set([...dependencies.keys(), ...[...references].map(locator => parseScopedDissectionAssetLocator(locator)!.jobId)])].sort()
  if (allJobIds.length > MAX_JOBS) fail(413, 'Too many protected source dependencies')
  // Capture hashes for locator-only historical canvases, then authorize every job
  // together before the first private object read. No caller-provided hashes.
  await transactionWithoutRetry(async db => {
    for (const jobId of allJobIds) {
      if (dependencies.has(jobId)) continue
      const job = (await db.query('SELECT user_id, manifest FROM banner_dissections WHERE job_id = $1 FOR SHARE', [jobId])).rows[0]
      const source = dissectionSourceSchema.safeParse(json(job?.manifest)?.source)
      if (!source.success) fail(403, 'Protected artwork is unavailable')
      dependencies.set(jobId, source.data.sha256)
    }
  })
  await recheckScopedExport(actorId, { version: 1, projectId: input.projectId, sourceRevision, target: snapshot.target,
    dependencies: [...dependencies].map(([jobId, sourceSha256]) => ({ jobId, sourceSha256 })) }, true)
  let expandedBytes = 0
  for (const locator of references) {
    const asset = await resolveScopedDissectionAsset(event, actorId, locator)
    expandedBytes += (4 * Math.ceil(asset.bytes.byteLength / 3) + 32) * occurrences.get(locator)!
    if (expandedBytes + savedStringBytes > BANNER_RENDER_LIMITS.MAX_REQUEST_HTML_BYTES) fail(413, 'Protected images exceed embedded export limits')
    if (dependencies.has(asset.jobId) && dependencies.get(asset.jobId) !== asset.sourceSha256) fail()
    dependencies.set(asset.jobId, asset.sourceSha256)
    if (dependencies.size > MAX_JOBS) fail(413, 'Too many protected source dependencies')
    embedded.set(locator, `data:${asset.mimeType};base64,${Buffer.from(asset.bytes).toString('base64')}`)
  }
  nodes = 0; walk(canvas, embedded)
  const provenance: ScopedExportIdentity = { version: 1, projectId: input.projectId, sourceRevision, target: snapshot.target,
    dependencies: [...dependencies].sort(([a], [b]) => a.localeCompare(b)).map(([jobId, sourceSha256]) => ({ jobId, sourceSha256 })) }
  // Validate metadata capacity before the renderer or any object write.
  scopedExportMetadata(provenance, '00000000-0000-4000-8000-000000000000', '0'.repeat(64))
  // Match the existing font catalogue from server records, never caller URLs.
  const fontRows = fontFamilies.size ? await transactionWithoutRetry(async db => (await db.query(
    "SELECT name, url, tags FROM banner_assets WHERE 'font' = ANY(tags) AND name = ANY($1::text[]) ORDER BY created_at DESC LIMIT 65",
    [[...fontFamilies]],
  )).rows) : []
  if (fontRows.length > 64) fail(413, 'Too many custom fonts for export')
  const seenFonts = new Set<string>()
  const customFonts = fontRows.flatMap(font => {
    assertNoScopedDissectionReferences(font)
    if (typeof font.name !== 'string' || typeof font.url !== 'string' || !Array.isArray(font.tags)) fail()
    const weight = Number.parseInt(font.tags.find((tag: string) => tag.startsWith('weight:'))?.slice(7) || '400') || 400
    const format = font.tags.find((tag: string) => tag.startsWith('format:'))?.slice(7) || 'woff2'
    const key = JSON.stringify([font.name, weight])
    if (seenFonts.has(key)) return []
    seenFonts.add(key)
    return [{ family: font.name, url: new URL(font.url, getAppUrl(event)).href,
      weight, format: ['woff2', 'woff', 'truetype', 'opentype'].includes(format) ? format : 'woff2' }]
  })
  let total = 0
  const formats = keys.map((key: string) => {
    const artboard = canvas[key]
    const format = resolveBannerFormat(key)
    if (!format || !artboard || !Array.isArray(artboard.layers)) fail(400, 'Export only saved canvas sizes')
    // Feed overrides are excluded: a saved protected export has a fixed source identity.
    if (artboard.feedUrl || artboard.feedBindings) fail(409, 'Remove dynamic feed overrides before exporting protected artwork')
    const baseUrl = getAppUrl(event)
    const html = buildBannerHTML(key, artboard.layers, { playback: artboard.playback, bgColor: artboard.bgColor,
      includeAnimations: mode !== 'image', baseUrl, customFonts })
    const length = bytes(html); total += length
    if (length > BANNER_RENDER_LIMITS.MAX_HTML_BYTES || total > BANNER_RENDER_LIMITS.MAX_REQUEST_HTML_BYTES) fail(413, 'Artwork exceeds embedded export limits')
    if (hasScopedDissectionReferences(html)) fail()
    return { key, html, width: format.w, height: format.h }
  })
  await recheckScopedExport(actorId, provenance, true)
  return { provenance, body: { ...input, formats } }
}
