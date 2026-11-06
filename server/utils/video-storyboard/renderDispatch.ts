import { randomUUID, timingSafeEqual } from 'node:crypto'
import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import type { GodModeTransactionDb as Db } from '~~/server/utils/godMode/transactionCoordinator'
import { createRenderJobIn, type CreateRenderJobInput } from '~~/server/utils/audio/projects'
import { pinStoryboardObject, renderBytesHash, type RenderPinBucket, type StoryboardRenderManifest } from '~~/shared/video-storyboard/renderManifest'
import type { StoryboardFormat } from '~~/shared/video/storyboardCompile'
import { storyboardHash } from './hash'
import { loadTimelineObligationsIn } from './lineage'
import { prepareStoryboardRenderIn, type ValidatedStoryboardRender } from './renderValidation'
import { fenceWriteAuthorityIn, fenceDependenciesIn } from './apply'
import { getStoryboardIn } from './store'
import { requireStoryboardProjectIn } from './access'
import { storyboardRequestDependencies } from './request'
import { resolveTimelineReferenceSetIn } from './reviewRecovery'

const rejected = (message = 'Storyboard render eligibility changed') => createError({ statusCode: 409, statusMessage: message })
export function assertStoryboardCallbackSecret(expected: unknown, authorization: string | undefined) {
  if (typeof expected !== 'string' || !expected || !authorization) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const actual = Buffer.from(authorization)
  const wanted = Buffer.from(`Bearer ${expected}`)
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
}
export function assertStoryboardOutputs(manifest: Pick<StoryboardRenderManifest, 'projectId' | 'jobId' | 'formats'>, variants: Record<string, string>) {
  if (Object.keys(variants).sort().join(',') !== [...manifest.formats].sort().join(',')) throw rejected('Render output formats do not match')
  for (const format of manifest.formats) {
    const prefix = `media/${manifest.projectId}/${manifest.jobId}/`
    const key = variants[format]
    if (!key?.startsWith(prefix)) throw rejected('Render output identity does not match')
    const remainder = key.slice(prefix.length)
    const [attempt, file, extra] = remainder.split('/')
    if (!z.string().uuid().safeParse(attempt).success || file !== `${format}.mp4` || extra !== undefined) throw rejected('Render output identity does not match')
  }
  // Worker may render each format using a separate attempt UUID; each path is
  // still strictly scoped to this job and exactly one requested format.
}
export const StoryboardCallbackSchema = z.object({
  action: z.enum(['check', 'publish']), jobId: z.string().uuid(), manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  variants: z.record(z.string(), z.string().max(512)).optional(), costCents: z.number().int().min(0).max(100000000).optional()
}).strict()
type Callback = z.infer<typeof StoryboardCallbackSchema>

function validatedSignature(prepared: ValidatedStoryboardRender) {
  return storyboardHash({ state: prepared.state, applicationId: prepared.lineage?.applicationId,
    contract: prepared.lineage?.contract, referenceSetId: prepared.lineage?.referenceSetId,
    objects: prepared.objects, overlays: prepared.overlays })
}
function assertReady(prepared: ValidatedStoryboardRender) {
  if (!prepared.lineage || prepared.findings.some(f => f.severity === 'blocker')) throw createError({ statusCode: 409, statusMessage: 'Review storyboard render findings before rendering', data: { findings: prepared.findings } })
}
/** No network/font fallback is allowed in a pinned overlay. Supported fonts are
 * container-owned system fonts; embedded data resources travel inside HTML. */
export function assertSelfContainedStoryboardHtml(html: string) {
  if (/<(?:script|iframe|object|embed|link|base)\b|\bon\w+\s*=|@import\b/i.test(html)
    || /(?:url\(\s*["']?\s*(?!data:)[a-z/:])|\bsrc\s*=\s*["']\s*(?!data:)/i.test(html)) throw rejected('Storyboard overlays require self-contained measured assets and fonts')
}
/** The project lock held by each caller fences global pointer writes. Lock
 * both global inventory and the exact edit's scoped additions before validation,
 * so ordinary asset UPDATE/DELETE cannot revoke approval before commit. */
async function fenceRenderReferencesIn(db: Db, saved: Awaited<ReturnType<typeof getStoryboardIn>>, referenceSetId: string | null, actor: CreateRenderJobInput['actor']) {
  await fenceDependenciesIn(db, saved, actor)
  if (!saved.referenceSet) throw rejected()
  const scoped = await resolveTimelineReferenceSetIn(db, saved.referenceSet, referenceSetId)
  if (!scoped.current) throw rejected()
  if (scoped.referenceSet.id !== saved.referenceSet.id) {
    await fenceDependenciesIn(db, { ...saved, referenceSet: scoped.referenceSet }, actor)
  }
}
export async function createStoryboardRenderJobIfObligated(event: H3Event, input: CreateRenderJobInput & { formats: StoryboardFormat[] }) {
  return transaction(db => createStoryboardRenderJobIfObligatedIn(db, event, input))
}
export async function createStoryboardRenderJobIfObligatedIn(db: Db, event: H3Event, input: CreateRenderJobInput & { formats: StoryboardFormat[] }) {
  // Missing tables/read failures propagate. Only an authoritative empty result
  // permits the existing unobligated renderer.
  const lineage = await loadTimelineObligationsIn(db, input.projectId, input.expectedTimelineId, input.expectedEditRevision)
  if (!lineage) return null
  const env = event.context.cloudflare?.env
  const bucket = env?.MEDIA_BUCKET as unknown as RenderPinBucket | undefined
  if (!bucket?.get || !bucket.put || !env?.STORYBOARD_MEDIA_PROBE || !env?.STORYBOARD_RENDER_SECRET || !env?.VIDEO_RENDER_QUEUE) throw createError({ statusCode: 503, statusMessage: 'Storyboard rendering capability unavailable' })
  await db.query('SET LOCAL lock_timeout = \'15s\'')
  const job = await createRenderJobIn(db, input)
  await fenceWriteAuthorityIn(db, input.actor)
  const timeline = (await db.query('SELECT edit_revision FROM media_timelines WHERE id = $1 AND project_id = $2', [job.timelineId, input.projectId])).rows[0]
  if (!timeline) throw rejected()
  // A same-revision human review could have committed before createRenderJobIn
  // acquired its project lock. Fence the lineage copied into this snapshot.
  const snapshotLineage = await loadTimelineObligationsIn(db, input.projectId, job.timelineId, timeline.edit_revision)
  if (!snapshotLineage) throw rejected()
  const saved = await getStoryboardIn(db, input.projectId, input.actor)
  await fenceRenderReferencesIn(db, saved, snapshotLineage.referenceSetId, input.actor)
  const prepared = await prepareStoryboardRenderIn(db, { actor: input.actor, projectId: input.projectId, timelineId: job.timelineId, editRevision: timeline.edit_revision, formats: input.formats }, storyboardRequestDependencies(event))
  assertReady(prepared)
  const overlayInputs = Object.values(prepared.overlays).flat()
  if (overlayInputs.some(overlay => !overlay.requiredCopy.length)) throw rejected('Every storyboard overlay needs measured required copy')
  if (prepared.objects.reduce((sum, object) => sum + object.size, 0) + overlayInputs.reduce((sum, overlay) => sum + new TextEncoder().encode(overlay.html).byteLength, 0) > 16 * 1024 * 1024) {
    throw rejected('Storyboard render inputs exceed the supported 16 MiB transport limit; use smaller source media')
  }
  const manifest: StoryboardRenderManifest = { id: randomUUID(), jobId: job.id, projectId: input.projectId, timelineId: job.timelineId, editRevision: timeline.edit_revision,
    formats: [...new Set(input.formats)], state: structuredClone(prepared.state), objects: [], resolvedOverlaysByFormat: {},
    dependencies: { actorId: input.actor.id, signature: validatedSignature(prepared) } }
  for (const source of prepared.objects) manifest.objects.push(await pinStoryboardObject(bucket, source, job.id))
  const state = manifest.state as typeof prepared.state
  for (const track of state.tracks) {
    track.clips = track.clips.filter(clip => clip.type !== 'caption')
    for (const clip of track.clips) if (clip.type === 'video' || clip.type === 'audio') {
      const object = manifest.objects.find(item => item.sourceKey === clip.r2_key)
      if (!object) throw rejected('Unpinned timeline input')
      clip.r2_key = object.key
    }
  }
  for (const [format, overlays] of Object.entries(prepared.overlays)) {
    manifest.resolvedOverlaysByFormat[format] = []
    for (const overlay of overlays) {
      assertSelfContainedStoryboardHtml(overlay.html)
      const bytes = new TextEncoder().encode(overlay.html).buffer
      const sha256 = await renderBytesHash(bytes)
      const key = `storyboard-render-inputs/${job.id}/${sha256}`
      await bucket.put(key, bytes, { httpMetadata: { contentType: 'text/html' } })
      manifest.objects.push({ key, sourceKey: key, etag: sha256, size: bytes.byteLength, sha256 })
      const { html: _html, ...timing } = overlay
      manifest.resolvedOverlaysByFormat[format]!.push({ ...timing, htmlKey: key })
    }
  }
  await db.query(`INSERT INTO video_storyboard_render_manifests (job_id,id,project_id,timeline_id,edit_revision,manifest,manifest_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [job.id, manifest.id, input.projectId, job.timelineId, timeline.edit_revision, JSON.stringify(manifest), storyboardHash(manifest)])
  return job
}

export async function authorizeStoryboardRenderCallbackIn(db: Db, event: H3Event, input: Callback) {
  await db.query('SET LOCAL lock_timeout = \'15s\'')
  const row = (await db.query(`SELECT j.*, m.manifest, m.manifest_hash FROM media_render_jobs j JOIN video_storyboard_render_manifests m ON m.job_id=j.id WHERE j.id=$1 FOR UPDATE OF j`, [input.jobId])).rows[0]
  if (!row || row.manifest_hash !== input.manifestHash || storyboardHash(row.manifest) !== input.manifestHash) throw rejected('Render manifest identity does not match')
  const manifest = row.manifest as StoryboardRenderManifest
  if (manifest.jobId !== row.id || manifest.projectId !== row.project_id || manifest.timelineId !== row.timeline_id) throw rejected('Render manifest identity does not match')
  if (input.action === 'publish') assertStoryboardOutputs(manifest, input.variants ?? {})
  if (row.status === 'done') {
    if (input.action === 'publish' && (storyboardHash(row.variants) !== storyboardHash(input.variants) || (row.cost_cents ?? 0) !== (input.costCents ?? 0))) throw rejected('Render already published with different outputs or cost')
    return { ok: true, completed: true }
  }
  if (!['queued', 'rendering'].includes(row.status)) throw rejected('Render is no longer publishable')
  const dependencies = manifest.dependencies as { actorId?: string, signature?: string } | undefined
  if (dependencies?.actorId !== row.requested_by) throw rejected('Render actor does not match')
  const actorRow = (await db.query('SELECT id, user_role AS role FROM team_members WHERE id=$1 AND is_active=TRUE FOR SHARE', [row.requested_by])).rows[0]
  if (!actorRow) throw rejected('Render actor no longer has access')
  const actor = { id: actorRow.id, role: actorRow.role }
  await requireStoryboardProjectIn(db, row.project_id, actor, true)
  await fenceWriteAuthorityIn(db, actor)
  const lineage = await loadTimelineObligationsIn(db, row.project_id, row.timeline_id, manifest.editRevision)
  if (!lineage) throw rejected()
  await fenceRenderReferencesIn(db, await getStoryboardIn(db, row.project_id, actor), lineage.referenceSetId, actor)
  const prepared = await prepareStoryboardRenderIn(db, { actor, projectId: row.project_id, timelineId: row.timeline_id, editRevision: manifest.editRevision, formats: manifest.formats as StoryboardFormat[] }, storyboardRequestDependencies(event))
  assertReady(prepared)
  if (validatedSignature(prepared) !== dependencies?.signature) throw rejected()
  if (input.action === 'publish') {
    const bucket = event.context.cloudflare?.env?.MEDIA_BUCKET as { head(key: string): Promise<{ size: number } | null> } | undefined
    if (!bucket?.head) throw createError({ statusCode: 503, statusMessage: 'Render output storage unavailable' })
    for (const key of Object.values(input.variants!)) if (!((await bucket.head(key))?.size)) throw rejected('Render output is unavailable')
    await db.query(`UPDATE media_render_jobs SET status='done', variants=$1, cost_cents=$2, progress=$4, error=NULL, updated_at=now() WHERE id=$3 AND status IN ('queued','rendering')`, [JSON.stringify(input.variants), input.costCents ?? 0, input.jobId, JSON.stringify({ stage: 'done', formatKey: null, done: manifest.formats.length, total: manifest.formats.length, updatedAt: new Date().toISOString() })])
  }
  return { ok: true, completed: input.action === 'publish' }
}
export function authorizeStoryboardRenderCallback(event: H3Event, input: Callback) {
  return transaction(db => authorizeStoryboardRenderCallbackIn(db, event, input))
}
