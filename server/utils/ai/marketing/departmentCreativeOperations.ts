/**
 * Marketing department Banner Studio creative production over MCP. Reuses native Banner Studio
 * storage (banner_projects/banner_versions/banner_templates/banner_assets), the native HTML
 * builder and render linter for previews, and the native MP4 render enqueue for exports. Every
 * call re-resolves fresh MARKETING_MANAGEMENT + department grant and the exact active client; every
 * project query is bound to that client. Writes bind the exact input in the execution ledger and
 * the exact project revision the caller read. Protected artwork (TheBrief import provenance, or a
 * project under review / approved) is never overwritten; draft a copy instead.
 */
import type { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { queryRowsFresh, transaction } from '~~/server/utils/db'
import { requireMarketingDepartment } from './departmentAuthority'
import { resolveMarketingReadScope, requireScopedClient } from './readScope'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import { departmentCreativeContracts, DEPARTMENT_CREATIVE_WRITE_NAMES, type DEPARTMENT_CREATIVE_READ_NAMES, type DepartmentCreativeToolName } from './departmentCreativeSchemas'
import {
  claimExecution, claimOutcome, finishExecution, refuse, refusalOf, sha256, validExecutionIdentity,
  type ExecutionIdentity, type LedgerDb
} from './departmentExecutionLedger'

type Args<N extends DepartmentCreativeToolName> = z.infer<(typeof departmentCreativeContracts)[N]>
const WRITES = new Set<string>(DEPARTMENT_CREATIVE_WRITE_NAMES)
const MAX_VERSIONS_PER_PROJECT = 50
const PREVIEW_HTML_LIMIT = 100_000

export interface DepartmentCreativeDeps {
  enqueue?: typeof import('~~/server/utils/banner/renderJob').enqueueBannerRender
  buildEnqueueDeps?: typeof import('~~/server/utils/banner/renderEnqueue').buildBannerRenderEnqueueDeps
}

/** Same precedence as readMcpRuntimeValue: a present request binding wins, else process env; strings only. */
function runtimeString(ctx: ToolContext, key: string): string | undefined {
  const env = (ctx.event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env
  const value = env && typeof env === 'object' && Object.prototype.hasOwnProperty.call(env, key) ? env[key] : process.env[key]
  return typeof value === 'string' ? value : undefined
}

const freshReader: LedgerDb = { query: async (sql, params) => ({ rows: await queryRowsFresh(sql, params as unknown[]) }) }

async function authorize(ctx: ToolContext, clientId: string, write: boolean): Promise<ToolContext> {
  const fresh = await requireMarketingDepartment(ctx, write)
  await requireScopedClient(await resolveMarketingReadScope(fresh), clientId)
  return fresh
}

// ---------------------------------------------------------------------------- project identity

interface ProjectRow {
  id: string
  name: string
  client_id: string
  canvas_data: unknown
  tags: string[] | null
  status: string | null
  review_status: string | null
  created_by: string
  updated_at?: unknown
}

function canvasOf(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
}

const isProvenanceTag = (tag: string) => /^source(:|-sha256)/i.test(tag)

/** Hash of exactly the artwork and metadata a caller acts on; any concurrent edit changes it. */
export function bannerRevisionOf(row: Pick<ProjectRow, 'name' | 'canvas_data' | 'tags' | 'status' | 'review_status'>): string {
  return sha256({ name: row.name, canvasData: canvasOf(row.canvas_data), tags: [...(row.tags ?? [])], status: row.status ?? null, reviewStatus: row.review_status ?? null })
}

function protectionOf(row: ProjectRow): string[] {
  const reasons: string[] = []
  if ((row.tags ?? []).some(isProvenanceTag)) reasons.push('imported_artwork')
  if (row.review_status === 'in_review') reasons.push('review_in_progress')
  if (row.review_status === 'approved') reasons.push('review_approved')
  return reasons
}

async function formatsOf(canvas: Record<string, unknown>): Promise<string[]> {
  const { resolveBannerFormat } = await import('~~/app/utils/banner-constants')
  return Object.keys(canvas).filter(key => Array.isArray((canvas[key] as { layers?: unknown } | null)?.layers) && resolveBannerFormat(key))
}

const PROJECT_COLUMNS = `p.id, p.name, p.client_id, p.canvas_data, p.tags, p.status, p.review_status, p.created_by, p.updated_at`

async function loadProject(db: LedgerDb, clientId: string, projectId: string, lock: boolean): Promise<ProjectRow> {
  const row = (await db.query(`SELECT ${PROJECT_COLUMNS} FROM banner_projects p
    JOIN agency_clients c ON c.id = p.client_id AND c.is_active = TRUE
    WHERE p.id = $1 AND p.client_id = $2${lock ? ' FOR UPDATE OF p' : ''}`, [projectId, clientId])).rows[0] as ProjectRow | undefined
  if (!row) refuse('Banner project not available for this client', 'not_found')
  return row
}

async function exactProject(db: LedgerDb, clientId: string, projectId: string, expectedRevision: string): Promise<ProjectRow> {
  const row = await loadProject(db, clientId, projectId, true)
  if (bannerRevisionOf(row) !== expectedRevision) refuse('The project changed since it was read; reload before acting', 'conflict')
  return row
}

/** Native HTML builder + render linter; the same HTML is what an export would render. */
async function renderableFormat(ctx: ToolContext, row: ProjectRow, format: string) {
  const { resolveBannerFormat } = await import('~~/app/utils/banner-constants')
  const artboard = canvasOf(row.canvas_data)[format] as { layers?: unknown[], playback?: unknown, bgColor?: string } | undefined
  const size = resolveBannerFormat(format)
  if (!artboard || !Array.isArray(artboard.layers) || !size) refuse(`This project has no renderable "${format}" artboard`, 'bad_args')
  const [{ buildBannerHTML }, { lintBannerRenderFormat, hasRenderLintErrors }, { CAPS }] = await Promise.all([
    import('~~/server/utils/banner/htmlBuilder'), import('~~/server/utils/banner/renderLinter'), import('~~/server/utils/banner/renderJob')
  ])
  // Native runner order (app URL, then R2 public URL), each read request-binding first, then process env.
  const baseUrl = runtimeString(ctx, 'NUXT_PUBLIC_APP_URL') ?? runtimeString(ctx, 'R2_PUBLIC_URL') ?? ''
  const html = buildBannerHTML(format, artboard.layers as never, {
    baseUrl, ...(artboard.bgColor ? { bgColor: artboard.bgColor } : {}), ...(artboard.playback ? { playback: artboard.playback as never } : {})
  })
  const findings = lintBannerRenderFormat({ key: format, html, width: size.w, height: size.h }, { fps: 30, quality: 1, crf: 23, maxDimension: CAPS.MAX_DIMENSION })
  return { html, width: size.w, height: size.h, layerCount: artboard.layers.length, findings, renderable: !hasRenderLintErrors(findings) }
}

// ---------------------------------------------------------------------------------------- reads

async function listProjects(args: Args<'marketing_list_banner_projects'>) {
  const params: unknown[] = [args.clientId]
  const where = ['p.client_id = $1']
  if (args.status) {
    params.push(args.status)
    where.push(`p.status = $${params.length}`)
  }
  if (args.afterId) {
    params.push(args.afterId)
    where.push(`p.id > $${params.length}::uuid`)
  }
  params.push(args.limit + 1)
  const rows = (await freshReader.query(`SELECT ${PROJECT_COLUMNS}, p.thumbnail_url FROM banner_projects p
    JOIN agency_clients c ON c.id = p.client_id AND c.is_active = TRUE
    WHERE ${where.join(' AND ')} ORDER BY p.id LIMIT $${params.length}`, params)).rows as Array<ProjectRow & { thumbnail_url: string | null }>
  const page = rows.slice(0, args.limit)
  const items = await Promise.all(page.map(async row => ({
    projectId: row.id, name: row.name, status: row.status, reviewStatus: row.review_status, tags: row.tags ?? [],
    formats: await formatsOf(canvasOf(row.canvas_data)), revision: bannerRevisionOf(row), protected: protectionOf(row),
    thumbnailUrl: row.thumbnail_url ?? null, updatedAt: row.updated_at ?? null
  })))
  return ok({ clientId: args.clientId, items, nextCursor: rows.length > args.limit ? page.at(-1)!.id : null, complete: rows.length <= args.limit, storedOnly: true })
}

async function getProject(args: Args<'marketing_get_banner_project'>) {
  const row = await loadProject(freshReader, args.clientId, args.projectId, false)
  const [versions, jobs, exports] = await Promise.all([
    queryRowsFresh(`SELECT v.version_number, v.created_by, v.created_at FROM banner_versions v
      WHERE v.project_id = $1 ORDER BY v.version_number DESC LIMIT 20`, [row.id]),
    queryRowsFresh(`SELECT j.id, j.format_key, j.status, j.error, j.created_at FROM banner_render_jobs j
      WHERE j.project_id = $1 ORDER BY j.created_at DESC LIMIT 10`, [row.id]),
    queryRowsFresh(`SELECT e.id, e.format_key, e.file_size, e.exported_at FROM banner_exports e
      WHERE e.project_id = $1 ORDER BY e.exported_at DESC LIMIT 10`, [row.id])
  ])
  const canvas = canvasOf(row.canvas_data)
  return ok({
    clientId: args.clientId,
    project: { projectId: row.id, name: row.name, status: row.status, reviewStatus: row.review_status, tags: row.tags ?? [], createdBy: row.created_by, updatedAt: row.updated_at ?? null },
    revision: bannerRevisionOf(row),
    protected: protectionOf(row),
    formats: await formatsOf(canvas),
    canvasData: canvas,
    versions,
    renderJobs: jobs,
    exports,
    editRule: 'Updates require this revision. Imported, in-review or approved artwork is protected: create a project copy instead.'
  })
}

async function listTemplates(args: Args<'marketing_list_banner_templates'>) {
  const params: unknown[] = []
  let where = 'TRUE'
  if (args.category) {
    params.push(args.category)
    where = `t.category = $1`
  }
  params.push(args.limit)
  const rows = await queryRowsFresh(`SELECT t.id, t.name, t.category, t.description, t.formats, t.tags, t.is_system, t.usage_count, t.thumbnail_url
    FROM banner_templates t WHERE ${where} ORDER BY t.is_system DESC, t.usage_count DESC NULLS LAST, t.created_at DESC, t.id LIMIT $${params.length}`, params)
  return ok({ clientId: args.clientId, items: rows, limit: args.limit, note: 'Templates are agency-wide starting points; create a client draft with sourceKind "template".' })
}

async function listAssets(args: Args<'marketing_list_banner_assets'>) {
  const params: unknown[] = [args.clientId]
  let cursor = ''
  if (args.afterId) {
    params.push(args.afterId)
    cursor = ` AND a.id > $${params.length}::uuid`
  }
  params.push(args.limit + 1)
  const rows = await queryRowsFresh<{ id: string }>(`SELECT a.id, a.name, a.mime_type, a.file_size, a.url, a.thumbnail_url, a.tags, a.created_at
    FROM banner_assets a JOIN agency_clients c ON c.id = a.client_id AND c.is_active = TRUE
    WHERE a.client_id = $1${cursor} ORDER BY a.id LIMIT $${params.length}`, params)
  const items = rows.slice(0, args.limit)
  return ok({ clientId: args.clientId, items, nextCursor: rows.length > args.limit ? items.at(-1)!.id : null, complete: rows.length <= args.limit, clientAssetsOnly: true })
}

async function previewProject(ctx: ToolContext, args: Args<'marketing_preview_banner_project'>) {
  const row = await loadProject(freshReader, args.clientId, args.projectId, false)
  const revision = bannerRevisionOf(row)
  if (args.expectedRevision && args.expectedRevision !== revision) refuse('The project changed since it was read; reload before previewing', 'conflict')
  const preview = await renderableFormat(ctx, row, args.format)
  const htmlBytes = Buffer.byteLength(preview.html)
  return ok({
    clientId: args.clientId, projectId: row.id, revision, format: args.format, width: preview.width, height: preview.height,
    layerCount: preview.layerCount, renderable: preview.renderable, findings: preview.findings, htmlBytes,
    html: htmlBytes <= PREVIEW_HTML_LIMIT ? preview.html : undefined, sideEffects: 'none'
  })
}

async function renderStatus(args: Args<'marketing_get_banner_render_status'>) {
  await loadProject(freshReader, args.clientId, args.projectId, false)
  const { projectJobStatus } = await import('~~/server/utils/banner/renderJob')
  const rows = await queryRowsFresh(`SELECT j.id, j.project_id, j.format_key, j.width, j.height, j.fps, j.crf, j.quality, j.source_r2_key,
      j.status, j.url, j.file_size, j.error
    FROM banner_render_jobs j JOIN banner_projects p ON p.id = j.project_id AND p.client_id = $2
    WHERE j.id = ANY($1::uuid[]) AND j.project_id = $3`, [args.jobIds, args.clientId, args.projectId])
  const jobs = projectJobStatus(rows as never)
  const found = new Set(jobs.map(job => job.jobId))
  return ok({ clientId: args.clientId, projectId: args.projectId, jobs, unknownJobIds: args.jobIds.filter(id => !found.has(id)) })
}

// ------------------------------------------------------------------------------------ mutations

const RETURNING = `RETURNING id, name, client_id, canvas_data, tags, status, review_status, created_by, updated_at`

async function createProject(db: LedgerDb, ctx: ToolContext, args: Args<'marketing_create_banner_project'>) {
  let canvas: Record<string, unknown>
  let inherited: string[] = []
  if (args.sourceKind === 'blank') {
    canvas = (await import('~~/server/utils/banner/draftCanvas')).buildMrecDraftCanvas(args.headline!)
  } else if (args.sourceKind === 'template') {
    const template = (await db.query(`SELECT id, canvas_data FROM banner_templates WHERE id = $1 FOR UPDATE`, [args.templateId])).rows[0]
    if (!template) refuse('Banner template not found', 'not_found')
    canvas = canvasOf(template.canvas_data)
    // Native "use template" accounting.
    await db.query(`UPDATE banner_templates SET usage_count = COALESCE(usage_count, 0) + 1 WHERE id = $1`, [args.templateId])
  } else {
    const source = await exactProject(db, args.clientId, args.sourceProjectId!, args.sourceRevision!)
    canvas = canvasOf(source.canvas_data)
    // A copy is new work, not an import: provenance identity stays with the original artwork.
    inherited = (source.tags ?? []).filter(tag => !isProvenanceTag(tag))
  }
  if (!(await formatsOf(canvas)).length) refuse('The source has no renderable artboard', 'bad_args')
  const tags = [...new Set([...inherited, ...(args.tags ?? [])])].slice(0, 20)
  const created = (await db.query(`INSERT INTO banner_projects (name, client_id, canvas_data, tags, status, created_by)
    VALUES ($1, $2, $3::jsonb, $4, 'draft', $5) ${RETURNING}`, [args.name, args.clientId, JSON.stringify(canvas), tags, ctx.userId])).rows[0] as ProjectRow | undefined
  if (!created) refuse('Banner project could not be created', 'unavailable')
  return { projectId: created.id, clientId: args.clientId, status: 'draft', revision: bannerRevisionOf(created), formats: await formatsOf(canvas), sourceKind: args.sourceKind }
}

async function updateProject(db: LedgerDb, ctx: ToolContext, args: Args<'marketing_update_banner_project'>) {
  const row = await exactProject(db, args.clientId, args.projectId, args.expectedRevision)
  const protection = protectionOf(row)
  if (protection.includes('review_in_progress') || protection.includes('review_approved')) {
    refuse('Artwork under review or approved is protected; create a project copy to make changes', 'conflict')
  }
  const { name, canvasData, tags } = args.changes
  if (canvasData && protection.includes('imported_artwork')) refuse('Imported source artwork is protected; create a project copy to edit it', 'conflict')
  if (canvasData && !(await formatsOf(canvasData)).length) refuse('Canvas must contain at least one renderable artboard', 'bad_args')
  const sets: string[] = []
  const params: unknown[] = [args.projectId, args.clientId]
  if (name !== undefined) {
    params.push(name)
    sets.push(`name = $${params.length}`)
  }
  if (canvasData !== undefined) {
    // Native auto-snapshot of the overwritten canvas, inside the same transaction.
    await db.query(`INSERT INTO banner_versions (project_id, version_number, canvas_data, created_by)
      SELECT $1, COALESCE(MAX(version_number), 0) + 1, $2::jsonb, $3 FROM banner_versions WHERE project_id = $1`,
    [row.id, JSON.stringify(canvasOf(row.canvas_data)), ctx.userId])
    await db.query(`DELETE FROM banner_versions WHERE id IN (SELECT id FROM banner_versions WHERE project_id = $1
      ORDER BY version_number DESC OFFSET $2)`, [row.id, MAX_VERSIONS_PER_PROJECT])
    params.push(JSON.stringify(canvasData))
    sets.push(`canvas_data = $${params.length}::jsonb`)
  }
  if (tags !== undefined) {
    // Provenance tags are preserved exactly; the schema already forbids supplying them.
    params.push([...new Set([...(row.tags ?? []).filter(isProvenanceTag), ...tags])])
    sets.push(`tags = $${params.length}`)
  }
  const updated = (await db.query(`UPDATE banner_projects SET ${sets.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND client_id = $2 ${RETURNING}`, params)).rows[0] as ProjectRow | undefined
  if (!updated) refuse('Banner project not available for this client', 'not_found')
  return { projectId: row.id, clientId: args.clientId, previousRevision: args.expectedRevision, revision: bannerRevisionOf(updated), snapshotted: canvasData !== undefined }
}

async function localMutation(name: DepartmentCreativeToolName, args: { clientId: string }, ctx: ToolContext, key: string, digest: string) {
  const fresh = await authorize(ctx, args.clientId, true)
  const identity: ExecutionIdentity = { actorId: fresh.userId, key, digest, tool: name, clientId: args.clientId, inputHash: sha256({ name, args }), executor: 'local-transactional' }
  return transaction(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return claimOutcome(claim)
    const result = name === 'marketing_create_banner_project'
      ? await createProject(db, fresh, args as Args<'marketing_create_banner_project'>)
      : await updateProject(db, fresh, args as Args<'marketing_update_banner_project'>)
    await finishExecution(db, identity, result)
    return ok({ ...result, committed: true })
  })
}

/** Render queue path: claim + exact revision commit first; anything after dispatch starts is held for reconciliation. */
async function exportRender(args: Args<'marketing_export_banner_render'>, ctx: ToolContext, key: string, digest: string, deps: DepartmentCreativeDeps): Promise<ToolResult> {
  let fresh = await authorize(ctx, args.clientId, true)
  const identity: ExecutionIdentity = { actorId: fresh.userId, key, digest, tool: 'marketing_export_banner_render', clientId: args.clientId, inputHash: sha256({ args }), executor: 'external-provider' }
  const prepared = await transaction(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return { kind: 'done' as const, outcome: claimOutcome(claim) }
    const row = await exactProject(db, args.clientId, args.projectId, args.expectedRevision)
    const format = await renderableFormat(ctx, row, args.format)
    if (!format.renderable) refuse(format.findings.find(f => f.severity === 'error')?.message ?? 'Artboard is not renderable', 'bad_args')
    return { kind: 'ready' as const, format }
  })
  if (prepared.kind === 'done') return prepared.outcome
  let dispatched = false
  const close = async (state: 'succeeded' | 'failed' | 'ambiguous', result: Record<string, unknown>) =>
    transaction(async pool => finishExecution(pool as unknown as LedgerDb, identity, result, state))
  try {
    // Re-check revocation and client scope immediately before the queue write.
    fresh = await authorize(fresh, args.clientId, true)
    const enqueue = deps.enqueue ?? (await import('~~/server/utils/banner/renderJob')).enqueueBannerRender
    const buildDeps = deps.buildEnqueueDeps ?? (await import('~~/server/utils/banner/renderEnqueue')).buildBannerRenderEnqueueDeps
    const { jobIds } = await enqueue(
      { projectId: args.projectId, formats: [{ key: args.format, html: prepared.format.html, width: prepared.format.width, height: prepared.format.height }], fps: args.fps, quality: args.quality, crf: 23, userId: fresh.userId },
      buildDeps(ctx.event, { genId: () => randomUUID(), markDispatched: async () => { dispatched = true } })
    )
    const result = { projectId: args.projectId, format: args.format, revision: args.expectedRevision, jobIds, status: 'queued' }
    try {
      await close('succeeded', result)
    } catch {
      return ok({ ...result, ledgerRecorded: false, note: 'Queued, but the execution record could not be finalised; do not retry.' })
    }
    return ok(result)
  } catch (error) {
    if (dispatched) {
      await close('ambiguous', { projectId: args.projectId, format: args.format, reconciliationRequired: true }).catch(() => undefined)
      return fail('Render submission could not be confirmed; check marketing_get_banner_project render jobs before any retry', 'reconciliation_required')
    }
    const message = refusalOf(error)
      ? (refusalOf(error) as { error: string }).error
      : (error as { statusMessage?: string, message?: string })?.statusMessage ?? 'Render could not start'
    await close('failed', { projectId: args.projectId, format: args.format, error: message.slice(0, 300) }).catch(() => undefined)
    const status = (error as { statusCode?: number })?.statusCode
    return refusalOf(error) ?? fail(message, status === 403 ? 'forbidden' : status === 404 ? 'not_found' : status === 503 ? 'unavailable' : 'conflict')
  }
}

export async function runDepartmentCreativeOperation(
  name: string, raw: unknown, ctx: ToolContext, key?: string, digest?: string, deps: DepartmentCreativeDeps = {}
): Promise<ToolResult> {
  const contract = departmentCreativeContracts[name as DepartmentCreativeToolName]
  if (!contract) return fail('Unknown department creative operation', 'not_found')
  const parsed = contract.safeParse(raw)
  if (!parsed.success) return fail('Invalid department creative arguments', 'bad_args')
  const args = parsed.data as { clientId: string }
  try {
    if (WRITES.has(name)) {
      if (!validExecutionIdentity(key, digest)) return fail('Verified logical request identity required', 'coordinator_required')
      if (name === 'marketing_export_banner_render') return await exportRender(args as Args<typeof name>, ctx, key, digest!, deps)
      return await localMutation(name as DepartmentCreativeToolName, args, ctx, key, digest!)
    }
    await authorize(ctx, args.clientId, false)
    switch (name as typeof DEPARTMENT_CREATIVE_READ_NAMES[number]) {
      case 'marketing_list_banner_projects': return await listProjects(args as Args<'marketing_list_banner_projects'>)
      case 'marketing_get_banner_project': return await getProject(args as Args<'marketing_get_banner_project'>)
      case 'marketing_list_banner_templates': return await listTemplates(args as Args<'marketing_list_banner_templates'>)
      case 'marketing_list_banner_assets': return await listAssets(args as Args<'marketing_list_banner_assets'>)
      case 'marketing_preview_banner_project': return await previewProject(ctx, args as Args<'marketing_preview_banner_project'>)
      default: return await renderStatus(args as Args<'marketing_get_banner_render_status'>)
    }
  } catch (error) {
    const refusal = refusalOf(error)
    if (refusal) return refusal
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 403) return fail('Not permitted for this marketing creative request', 'forbidden')
    if (status === 404) return fail('Client not available', 'not_found')
    return fail('Department creative operation unavailable', 'unavailable')
  }
}
