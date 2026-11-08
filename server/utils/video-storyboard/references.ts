import { createError, type H3Event } from 'h3'
import { ReferenceSelectionSchema, ReferenceSourceKindSchema, type ReferenceSetWrite, type PinnedReference, type ReferenceSourceKind, type StoryboardReferenceSet } from '~~/shared/video/storyboardReferences'
import type { ReadinessFinding } from '~~/shared/video/storyboard'
import type { GodModeTransactionDb } from '~~/server/utils/godMode/transactionCoordinator'
import type { MediaProjectActor } from '~~/server/utils/audio/projects'
import { getFileMetadata, type R2BucketBinding } from '~~/server/utils/storage'
import type { StoryboardProject } from './access'
import { storyboardHash } from './hash'

export interface ReferenceDependencies { bucket?: R2BucketBinding, event?: H3Event, metadataBudget?: { remainingMs: number } }
/** Bound waiting for read-only HEAD work while application locks are held.
 * Native R2 HEAD has no abort signal: timeout stops waiting, not the remote read.
 * Never wrap the whole transaction in a race; its SQL must finish/roll back normally. */
export async function storyboardFileMetadata(key: string, deps: ReferenceDependencies) {
  if (deps.metadataBudget === undefined) return getFileMetadata(key, deps.bucket)
  const remaining = deps.metadataBudget.remainingMs
  if (remaining <= 0) throw new Error('Storyboard metadata deadline exceeded')
  const started = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      getFileMetadata(key, deps.bucket),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Storyboard metadata deadline exceeded')), remaining) })
    ])
  } finally {
    deps.metadataBudget.remainingMs = Math.max(0, remaining - (Date.now() - started))
    if (timer) clearTimeout(timer)
  }
}
export interface ReferencePins { references: PinnedReference[], brandKit: StoryboardReferenceSet['brandKit'] }
const unavailable = () => createError({ statusCode: 409, statusMessage: 'Reference is unavailable or not ready for use' })
const changed = () => createError({ statusCode: 409, statusMessage: 'Reference changed; review its current content before approving' })
const tables = { video_asset: 'video_assets', audio_asset: 'audio_assets', source_asset: 'video_gen_source_assets', banner_project: 'banner_projects', brand_kit: 'brand_kits' } as const

/** Only canonical IDs select a source. No URL supplied by a caller is fetched. */
export async function canonicalReferenceIn(db: GodModeTransactionDb, project: StoryboardProject, actor: MediaProjectActor, kind: ReferenceSourceKind | 'brand_kit', id: string, deps: ReferenceDependencies = {}) {
  const table = tables[kind]
  if (!table) throw unavailable()
  const row = (await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows[0]
  if (!row) throw unavailable()
  // Agency-owned sources may be used across clients, but never another client's.
  if (row.client_id !== null && row.client_id !== project.clientId) {
    throw createError({ statusCode: 403, statusMessage: 'Reference is outside this project client scope' })
  }
  const isBanner = kind === 'banner_project' || kind === 'brand_kit'
  if (isBanner) {
    const { requireStoryboardBannerAccess } = await import('./bannerAuthority')
    await requireStoryboardBannerAccess(db, deps.event, actor, kind, row)
  }
  let hasAccess = isBanner || actor.role === 'admin' || actor.role === 'owner' || row.created_by === actor.id
  if (!hasAccess && kind === 'source_asset') hasAccess = row.client_id === null || row.client_id === project.clientId
  // Imported audio follows the same origin-project rule as video assets: the uploader
  // (often an admin) is recorded as creator, so the origin project's owner may use it.
  if (!hasAccess && (kind === 'video_asset' || (kind === 'audio_asset' && row.source === 'imported')) && row.source_project_id) {
    const origin = (await db.query('SELECT created_by FROM media_projects WHERE id = $1', [row.source_project_id])).rows[0]
    hasAccess = origin?.created_by === actor.id
  }
  if (!hasAccess) throw createError({ statusCode: 403, statusMessage: 'Reference access denied' })
  if ((kind === 'source_asset' && row.status !== 'approved')
    || (kind === 'audio_asset' && !['ready', 'done'].includes(row.status))
    || ['deleted', 'revoked', 'archived'].includes(row.status)) throw unavailable()

  // Hash canonical content/association and its update stamp, never expiring URLs.
  // Any canonical update conservatively requires review, including title edits.
  const record = {
    id, kind, clientId: row.client_id, updatedAt: row.updated_at ?? row.created_at,
    canvas: row.canvas_data ?? null,
    brand: kind === 'brand_kit' ? { colors: row.colors, fonts: row.fonts, logos: row.logos, guidelines: row.guidelines } : null,
    source: { system: row.source_system ?? null, ref: row.source_asset_ref ?? null, subjectType: row.subject_type ?? null, metadata: row.source_metadata ?? row.metadata ?? null }
  }
  if (kind === 'banner_project' || kind === 'brand_kit') {
    return { contentHash: storyboardHash(record), identityKind: 'record' as const }
  }
  const key = kind === 'audio_asset' ? row.r2_key_master : row.r2_key
  if (typeof key !== 'string' || !key || /^https?:\/\//i.test(key)) throw unavailable()
  // HEAD uses the existing private storage adapter and a server-resolved key.
  const object = await storyboardFileMetadata(key, deps).catch(() => null)
  if (!object?.etag || object.size <= 0) throw unavailable()
  return {
    contentHash: storyboardHash({ record, key, object: { etag: object.etag, size: object.size, contentType: object.contentType } }),
    identityKind: 'record_and_object' as const
  }
}

export async function pinReferencesIn(db: GodModeTransactionDb, project: StoryboardProject, actor: MediaProjectActor, input: ReferenceSetWrite['references'], brandKit: ReferenceSetWrite['brandKit'], deps: ReferenceDependencies = {}): Promise<ReferencePins> {
  const references: PinnedReference[] = []
  for (const raw of input) {
    const parsed = ReferenceSelectionSchema.safeParse(raw)
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid reference decision' })
    const selection = parsed.data
    const identity = await canonicalReferenceIn(db, project, actor, selection.sourceKind, selection.assetId, deps)
    if (selection.expectedContentHash && selection.expectedContentHash !== identity.contentHash) throw changed()
    references.push({
      role: selection.role, sourceKind: selection.sourceKind, assetId: selection.assetId, ...identity,
      decision: selection.decision,
      approval: selection.decision === 'approved'
        ? { actorId: actor.id, approvedAt: new Date().toISOString(), contentHash: identity.contentHash, evidence: selection.evidence }
        : null
    })
  }
  let pinnedBrand: ReferencePins['brandKit'] = null
  if (brandKit) {
    const identity = await canonicalReferenceIn(db, project, actor, 'brand_kit', brandKit.id, deps)
    if (brandKit.expectedContentHash && brandKit.expectedContentHash !== identity.contentHash) throw changed()
    pinnedBrand = { id: brandKit.id, contentHash: identity.contentHash }
  }
  return { references, brandKit: pinnedBrand }
}

export async function checkReferencesIn(db: GodModeTransactionDb, project: StoryboardProject, actor: MediaProjectActor, pins: ReferencePins, deps: ReferenceDependencies = {}): Promise<ReadinessFinding[]> {
  const findings: ReadinessFinding[] = []
  const block = (code: string, message: string) => findings.push({ code, severity: 'blocker', message })
  for (const ref of pins.references) {
    if (!ref.approval || ref.decision !== 'approved' || ref.approval.contentHash !== ref.contentHash) {
      block(ref.decision === 'revoked' ? 'usage_revoked' : 'usage_approval_required', 'This reference needs current project usage approval.')
    }
    try {
      ReferenceSourceKindSchema.parse(ref.sourceKind)
      const current = await canonicalReferenceIn(db, project, actor, ref.sourceKind, ref.assetId, deps)
      if (current.contentHash !== ref.contentHash) block('reference_changed', 'Referenced content or its source association has changed.')
    } catch {
      // Content-free findings: do not reveal another client's source record.
      block('reference_unavailable', 'A reference is missing, inaccessible or no longer ready.')
    }
  }
  if (pins.brandKit) {
    try {
      const current = await canonicalReferenceIn(db, project, actor, 'brand_kit', pins.brandKit.id, deps)
      if (current.contentHash !== pins.brandKit.contentHash) block('brand_kit_changed', 'The pinned brand kit changed and needs review.')
    } catch { block('brand_kit_unavailable', 'The pinned brand kit is unavailable.') }
  }
  return findings
}
