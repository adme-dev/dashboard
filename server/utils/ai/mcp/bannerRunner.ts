// server/utils/ai/mcp/bannerRunner.ts
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { escapeLike } from '~~/server/utils/ai/toolContext'
import { loadBannerLayers } from '~~/server/utils/audio/bannerOverlay'
import { buildBannerHTML } from '~~/server/utils/banner/htmlBuilder'
import { enqueueBannerRender, projectJobStatus, type BannerJobRow, type BannerRenderInput } from '~~/server/utils/banner/renderJob'
import { proposeAction } from '~~/server/utils/ai/pendingActions'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { FORMATS } from '~~/app/utils/banner-constants'
import { uploadFile } from '~~/server/utils/storage'
import { randomUUID } from 'uncrypto'
import type { BannerReadRunner, BannerProposeDeps, BannerRenderPendingPayload } from './bannerTools'

/** Parse canvas_data — stored as JSONB (object) or occasionally a JSON string. */
function parseCanvasData(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return {} }
  }
  return (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
}

/** Extract valid format keys from a flat canvas_data record (top-level keys that are real FORMATS entries with a layers array). */
function extractFormats(raw: unknown): string[] {
  const cd = parseCanvasData(raw)
  return Object.keys(cd).filter(k => k in FORMATS && cd[k] && Array.isArray((cd[k] as any).layers))
}

export interface LoadProjectsRow { id: string, name: string, canvas_data: unknown, updated_at: string }
export interface LoadProjectRow { id: string, name: string, canvas_data: unknown }

/** Injected loaders for banner projects — default implementations reach the DB; override in tests. */
export interface BannerProjectLoaders {
  loadProjectsRows: () => Promise<LoadProjectsRow[]>
  loadProjectRow: (nameOrId: string) => Promise<LoadProjectRow | null>
}

function defaultLoaders(): BannerProjectLoaders {
  return {
    loadProjectsRows: () => queryRows<LoadProjectsRow>(
      `SELECT id, name, canvas_data, updated_at FROM banner_projects ORDER BY updated_at DESC LIMIT 50`, []),
    loadProjectRow: (nameOrId: string) => queryOne<LoadProjectRow>(
      `SELECT id, name, canvas_data FROM banner_projects WHERE id::text = $1 OR name ILIKE $2 ORDER BY (id::text = $1) DESC, name ASC LIMIT 1`,
      [nameOrId, `%${escapeLike(nameOrId)}%`]),
  }
}

/** Resolve a banner project for the actor: name-or-id → { id, name, formats }.
 * ctx is intentionally unused — banner studio is staff-wide, unscoped lookup. */
async function resolveBannerProject(nameOrId: string, loaders: BannerProjectLoaders): Promise<{ id: string, name: string, formats: string[] } | null> {
  const row = await loaders.loadProjectRow(nameOrId)
  if (!row) return null
  return { id: row.id, name: row.name, formats: extractFormats(row.canvas_data) }
}

export function buildBannerReadRunner(loaders?: BannerProjectLoaders): BannerReadRunner {
  const l = loaders ?? defaultLoaders()
  return {
    list_banner_projects: async () => {
      const rows = await l.loadProjectsRows()
      return {
        projects: rows.map(r => ({
          id: r.id,
          name: r.name,
          formats: extractFormats(r.canvas_data),
          updatedAt: r.updated_at,
        })),
      }
    },
    get_banner_render_status: async (raw) => {
      const ids = ((raw as { jobIds?: string[] }).jobIds ?? []).slice(0, 20)
      if (!ids.length) return { jobs: [] }
      const rows = await queryRows<BannerJobRow>(
        `SELECT id, project_id, format_key, width, height, fps, crf, quality, source_r2_key, status, url, file_size, error
           FROM banner_render_jobs WHERE id = ANY($1)`, [ids])
      return { jobs: projectJobStatus(rows) }
    },
  }
}

export function buildBannerProposeDeps(): BannerProposeDeps {
  return {
    resolveProject: (project: string) => resolveBannerProject(project, defaultLoaders()),
    persist: (ctx, action, payload) => proposeAction(ctx, null, action, payload),
  }
}

export interface BannerConfirmDeps {
  loadLayers: (projectId: string, format: string) => Promise<{ layers: any[], width: number, height: number }>
  buildHtml: (format: string, layers: any[], options: { baseUrl: string }) => string
  enqueue: (input: BannerRenderInput, deps: any) => Promise<{ jobIds: string[] }>
}

export async function dispatchBannerConfirm(payload: BannerRenderPendingPayload, ctx: ToolContext, deps: BannerConfirmDeps): Promise<{ ok: true, data: { jobIds: string[] } } | { ok: false, error: string }> {
  try {
    const { layers, width, height } = await deps.loadLayers(payload.projectId, payload.format)
    const baseUrl = process.env.NUXT_PUBLIC_APP_URL ?? process.env.R2_PUBLIC_URL ?? ''
    const html = deps.buildHtml(payload.format, layers, { baseUrl })
    const enqueueDeps = {
      genId: () => randomUUID(),
      putSourceHtml: async (key: string, h: string) => { await uploadFile(Buffer.from(h, 'utf8'), key, 'text/html') },
      insertJob: async (r: any) => {
        await execute(
          `INSERT INTO banner_render_jobs (id, project_id, format_key, width, height, fps, crf, quality, source_r2_key, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [r.id, r.project_id, r.format_key, r.width, r.height, r.fps, r.crf, r.quality, r.source_r2_key, r.created_by])
      },
      sendQueue: async (msg: { jobId: string }) => {
        const q = (ctx.event.context as any).cloudflare?.env?.BANNER_RENDER_QUEUE
        if (!q) throw new Error('BANNER_RENDER_QUEUE unavailable')
        await q.send(msg)
      },
    }
    const { jobIds } = await deps.enqueue(
      { projectId: payload.projectId, formats: [{ key: payload.format, html, width, height }], fps: payload.fps, crf: 23, quality: payload.quality, userId: ctx.userId },
      enqueueDeps,
    )
    return { ok: true, data: { jobIds } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'banner render dispatch failed' }
  }
}

export function buildBannerConfirmDeps(): BannerConfirmDeps {
  return {
    loadLayers: loadBannerLayers,
    buildHtml: buildBannerHTML,
    enqueue: enqueueBannerRender,
  }
}
