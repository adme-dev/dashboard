/**
 * Brand kits — shared server helpers.
 * Row mapping, validation, default-per-client handling, version snapshots,
 * and the prompt block that feeds brand context into the AI endpoints.
 */
import { z } from 'zod'
import { queryOne, queryRows, transaction } from '~~/server/utils/db'

export const COLOR_ROLES = ['primary', 'secondary', 'accent', 'background', 'text', 'extra'] as const
export const FONT_ROLES = ['heading', 'body', 'extra'] as const

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colours must be 6-digit hex, e.g. #1a2b3c')

export const brandKitColorSchema = z.object({
  role: z.enum(COLOR_ROLES),
  hex,
  label: z.string().trim().max(60).optional()
})

export const brandKitFontSchema = z.object({
  role: z.enum(FONT_ROLES),
  family: z.string().trim().min(1).max(120),
  weights: z.array(z.number().int().min(100).max(900)).max(9).default([400, 700])
})

export const brandKitLogoSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().url().max(2000),
  r2Key: z.string().max(500),
  variant: z.enum(['light', 'dark', 'any']).optional()
})

export const brandKitInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  clientId: z.string().uuid().nullable().optional(),
  colors: z.array(brandKitColorSchema).max(24).default([]),
  fonts: z.array(brandKitFontSchema).max(8).default([]),
  logos: z.array(brandKitLogoSchema).max(12).default([]),
  guidelines: z.string().max(20_000).nullable().optional(),
  isDefault: z.boolean().optional(),
  sourceUrl: z.string().url().max(2000).nullable().optional()
})
export type BrandKitInput = z.infer<typeof brandKitInputSchema>

export const BRAND_KIT_SELECT = `
  bk.id, bk.name,
  bk.client_id AS "clientId",
  ac.name AS "clientName",
  ac.logo_url AS "clientLogoUrl",
  bk.colors, bk.fonts, bk.logos,
  bk.guidelines,
  bk.is_default AS "isDefault",
  bk.source_url AS "sourceUrl",
  bk.created_by AS "createdBy",
  bk.created_at AS "createdAt",
  bk.updated_at AS "updatedAt"
`

/** Legacy rows (pre-v2) stored bare hex strings / fonts without roles. Normalise on read. */
export function normaliseKitRow<T extends { colors: any, fonts: any, logos: any }>(row: T): T {
  const colors = Array.isArray(row.colors) ? row.colors : []
  const fonts = Array.isArray(row.fonts) ? row.fonts : []
  const roleByIndex = ['primary', 'background', 'secondary', 'accent', 'text']
  return {
    ...row,
    colors: colors.map((c: any, i: number) => typeof c === 'string'
      ? { role: roleByIndex[i] || 'extra', hex: c }
      : c),
    fonts: fonts.map((f: any, i: number) => ({ role: f.role || (i === 0 ? 'heading' : i === 1 ? 'body' : 'extra'), ...f })),
    logos: Array.isArray(row.logos) ? row.logos : []
  }
}

export async function getBrandKit(id: string) {
  const row = await queryOne(`
    SELECT ${BRAND_KIT_SELECT}
    FROM brand_kits bk
    LEFT JOIN agency_clients ac ON ac.id = bk.client_id
    WHERE bk.id = $1
  `, [id])
  return row ? normaliseKitRow(row as any) : null
}

/** The kit a project should inherit: the client's default, else the agency-wide default. */
export async function getDefaultBrandKitForClient(clientId: string | null | undefined) {
  const rows = await queryRows(`
    SELECT ${BRAND_KIT_SELECT}
    FROM brand_kits bk
    LEFT JOIN agency_clients ac ON ac.id = bk.client_id
    WHERE bk.is_default AND (bk.client_id = $1 OR bk.client_id IS NULL)
    ORDER BY (bk.client_id IS NOT NULL) DESC
    LIMIT 1
  `, [clientId || null])
  return rows[0] ? normaliseKitRow(rows[0] as any) : null
}

/** Snapshot the current row as the next version (called before a mutation). */
export async function snapshotBrandKitVersion(db: { query: (sql: string, params?: any[]) => Promise<any> }, kitId: string, userId: string | null, note?: string) {
  const cur = await db.query(`SELECT name, colors, fonts, logos, guidelines FROM brand_kits WHERE id = $1`, [kitId])
  const row = cur.rows?.[0]
  if (!row) return
  await db.query(`
    INSERT INTO brand_kit_versions (brand_kit_id, version, snapshot, note, created_by)
    VALUES ($1, COALESCE((SELECT MAX(version) FROM brand_kit_versions WHERE brand_kit_id = $1), 0) + 1, $2, $3, $4)
  `, [kitId, JSON.stringify(row), note || null, userId])
}

/** Enforce one default per client scope. */
export async function setDefaultBrandKit(kitId: string, clientId: string | null) {
  await transaction(async (db) => {
    if (clientId) {
      await db.query(`UPDATE brand_kits SET is_default = false WHERE client_id = $1 AND id <> $2 AND is_default`, [clientId, kitId])
    } else {
      await db.query(`UPDATE brand_kits SET is_default = false WHERE client_id IS NULL AND id <> $1 AND is_default`, [kitId])
    }
    await db.query(`UPDATE brand_kits SET is_default = true, updated_at = NOW() WHERE id = $1`, [kitId])
  })
}

/**
 * Prompt block describing a brand for AI copy / image / code assistance.
 * Returns '' when there is nothing useful to say.
 */
export function brandContextBlock(kit: { name: string, colors: any[], fonts: any[], guidelines: string | null } | null | undefined): string {
  if (!kit) return ''
  const parts: string[] = [`Brand: ${kit.name}`]
  if (kit.colors?.length) {
    parts.push('Brand colours: ' + kit.colors.map((c: any) => `${c.role}${c.label ? ` (${c.label})` : ''} ${c.hex}`).join(', '))
  }
  if (kit.fonts?.length) {
    parts.push('Brand fonts: ' + kit.fonts.map((f: any) => `${f.role}: ${f.family}`).join(', '))
  }
  if (kit.guidelines?.trim()) {
    parts.push('Brand guidelines:\n' + kit.guidelines.trim().slice(0, 4000))
  }
  return parts.length > 1 ? `\n\n[Brand context — follow this]\n${parts.join('\n')}` : ''
}

/** Resolve brand context for an AI call from either an explicit kit or a project's client. */
export async function brandContextForRequest(opts: { brandKitId?: string | null, projectId?: string | null, clientId?: string | null }): Promise<string> {
  // No identifiers → no brand. Anonymous AI calls must not hit the DB (and must not inherit the agency default).
  if (!opts.brandKitId && !opts.projectId && !opts.clientId) return ''
  try {
    if (opts.brandKitId) {
      return brandContextBlock(await getBrandKit(opts.brandKitId))
    }
    let clientId = opts.clientId || null
    if (!clientId && opts.projectId) {
      const p = await queryOne(`SELECT client_id FROM banner_projects WHERE id = $1`, [opts.projectId]) as any
      clientId = p?.client_id || null
    }
    return brandContextBlock(await getDefaultBrandKitForClient(clientId))
  } catch (error) {
    // Brand context is an enhancement — never fail the AI request because of it
    console.warn('[brandKits] brand context unavailable', error instanceof Error ? error.message : error)
    return ''
  }
}
