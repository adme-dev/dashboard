// server/utils/ai/mcp/bannerRunner.ts
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { escapeLike } from '~~/server/utils/ai/toolContext'
import { loadBannerLayers } from '~~/server/utils/audio/bannerOverlay'
import { buildBannerHTML } from '~~/server/utils/banner/htmlBuilder'
import { enqueueBannerRender, projectJobStatus, type BannerJobRow } from '~~/server/utils/banner/renderJob'
import { proposeAction } from '~~/server/utils/ai/pendingActions'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { FORMATS } from '~~/app/utils/banner-constants'
import { uploadFile } from '~~/server/utils/storage'
import { randomUUID } from 'uncrypto'
import type { BannerReadRunner, BannerProposeDeps, BannerRenderPendingPayload } from './bannerTools'

/** Resolve a banner project for the actor: name-or-id → { id, name, formats }. Scope: banner studio is staff-wide. */
async function resolveBannerProject(nameOrId: string): Promise<{ id: string, name: string, formats: string[] } | null> {
  const row = await queryOne<{ id: string, name: string, canvas_data: any }>(
    `SELECT id, name, canvas_data FROM banner_projects WHERE id::text = $1 OR name ILIKE $2 ORDER BY (id::text = $1) DESC, name ASC LIMIT 1`,
    [nameOrId, `%${escapeLike(nameOrId)}%`],
  )
  if (!row) return null
  const artboards = row.canvas_data?.artboards ?? row.canvas_data?.formats ?? {}
  const formats = Object.keys(artboards).filter(k => k in FORMATS)
  return { id: row.id, name: row.name, formats }
}

export function buildBannerReadRunner(): BannerReadRunner {
  return {
    list_banner_projects: async () => {
      const rows = await queryRows<{ id: string, name: string, canvas_data: any, updated_at: string }>(
        `SELECT id, name, canvas_data, updated_at FROM banner_projects ORDER BY updated_at DESC LIMIT 50`, [])
      return {
        projects: rows.map(r => {
          const ab = r.canvas_data?.artboards ?? r.canvas_data?.formats ?? {}
          return { id: r.id, name: r.name, formats: Object.keys(ab).filter(k => k in FORMATS), updatedAt: r.updated_at }
        }),
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
    resolveProject: (project: string) => resolveBannerProject(project),
    persist: (ctx, action, payload) => proposeAction(ctx, null, action, payload),
  }
}

export interface BannerConfirmDeps {
  loadLayers: (projectId: string, format: string) => Promise<{ layers: any[], width: number, height: number }>
  buildHtml: (format: string, layers: any[], options: { baseUrl: string }) => string
  enqueue: (input: { projectId: string, formats: { key: string, html: string, width: number, height: number }[], fps: number, crf: number, quality: 1 | 2, userId: string }, deps: any) => Promise<{ jobIds: string[] }>
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
    enqueue: enqueueBannerRender as any,
  }
}
