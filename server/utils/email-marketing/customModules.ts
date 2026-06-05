// server/utils/email-marketing/customModules.ts
// DB layer + validation for edm_custom_modules (EDM enterprise Phase 2).
// A custom module stores a document fragment (block subtree) that can be
// re-inserted into any email. Agency-wide by default; optional client_id.

import { z } from 'zod'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { addEmailClientScopeCondition, type EmailClientScope } from './access'

export type EdmModulePreviewTone = 'light' | 'dark' | 'accent'

export interface EdmModuleFragment {
  blocks: Record<string, { type: string, data: Record<string, unknown> }>
  rootChildrenIds: string[]
}

export interface EdmCustomModule {
  id: string
  name: string
  description: string | null
  category: string
  blocks: EdmModuleFragment
  preview_tone: EdmModulePreviewTone
  client_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Validation ───────────────────────────────────────────────────────────────
// Guardrails: a module is operator-authored block JSON, but we still bound it so
// a malformed/oversized payload can't be persisted. Pure + unit-tested.
export const MAX_MODULE_BLOCKS = 300
export const MAX_MODULE_BYTES = 512 * 1024 // 512KB serialized fragment

const BlockSchema = z.object({
  type: z.string().min(1).max(80),
  data: z.record(z.string(), z.unknown())
}).passthrough()

// Child ids a block references, across both container shapes (childrenIds +
// ColumnsContainer props.columns[].childrenIds). Mirrors edmModuleFragment.
function blockChildRefs(block: { data?: Record<string, unknown> }): string[] {
  const data = (block?.data ?? {}) as Record<string, unknown>
  const ids: string[] = []
  if (Array.isArray(data.childrenIds)) ids.push(...(data.childrenIds as string[]))
  const props = data.props as Record<string, unknown> | undefined
  const columns = props?.columns as Array<{ childrenIds?: string[] }> | undefined
  if (Array.isArray(columns)) {
    for (const col of columns) {
      if (Array.isArray(col?.childrenIds)) ids.push(...col.childrenIds)
    }
  }
  return ids
}

export const ModuleFragmentSchema = z.object({
  blocks: z.record(z.string().min(1), BlockSchema),
  rootChildrenIds: z.array(z.string().min(1)).min(1)
}).superRefine((frag, ctx) => {
  const ids = Object.keys(frag.blocks)
  if (ids.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'fragment has no blocks' })
  }
  if (ids.length > MAX_MODULE_BLOCKS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `fragment exceeds ${MAX_MODULE_BLOCKS} blocks` })
  }
  // every rootChildId must resolve to a real block in the map
  for (const rid of frag.rootChildrenIds) {
    if (!frag.blocks[rid]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `rootChildrenIds references unknown block: ${rid}` })
    }
  }
  // the fragment must be internally closed — every block's child references must
  // resolve within the map, else inserting it could leak/collide ids.
  for (const [id, block] of Object.entries(frag.blocks)) {
    for (const ref of blockChildRefs(block)) {
      if (!frag.blocks[ref]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `block ${id} references unknown child: ${ref}` })
      }
    }
  }
  // overall size guard (passthrough allows arbitrary per-block width)
  if (JSON.stringify(frag).length > MAX_MODULE_BYTES) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `fragment exceeds ${MAX_MODULE_BYTES} bytes` })
  }
})

export const PreviewToneSchema = z.enum(['light', 'dark', 'accent'])

/**
 * Validate + normalize a fragment. Throws a ZodError on invalid input.
 * Returned object is a plain validated EdmModuleFragment.
 */
export function validateModuleFragment(input: unknown): EdmModuleFragment {
  return ModuleFragmentSchema.parse(input) as EdmModuleFragment
}

// ── DB layer ─────────────────────────────────────────────────────────────────
export async function listCustomModules(clientIds?: EmailClientScope): Promise<EdmCustomModule[]> {
  const conditions: string[] = []
  const params: unknown[] = []
  addEmailClientScopeCondition(conditions, params, 'client_id', clientIds)
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return queryRows<EdmCustomModule>(`SELECT * FROM edm_custom_modules ${where} ORDER BY updated_at DESC`, params)
}

export async function getCustomModule(id: string): Promise<EdmCustomModule | null> {
  return queryOne<EdmCustomModule>('SELECT * FROM edm_custom_modules WHERE id = $1', [id])
}

export async function createCustomModule(input: {
  name: string
  description?: string | null
  category?: string | null
  blocks: EdmModuleFragment
  preview_tone?: EdmModulePreviewTone | null
  client_id?: string | null
  created_by: string | null
}): Promise<EdmCustomModule> {
  const row = await queryOne<EdmCustomModule>(`
    INSERT INTO edm_custom_modules (name, description, category, blocks, preview_tone, client_id, created_by)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
    RETURNING *
  `, [
    input.name,
    input.description ?? null,
    input.category ?? 'custom',
    JSON.stringify(input.blocks),
    input.preview_tone ?? 'light',
    input.client_id ?? null,
    input.created_by
  ])
  return row as EdmCustomModule
}

export async function updateCustomModule(id: string, patch: {
  name?: string
  description?: string | null
  category?: string
  preview_tone?: EdmModulePreviewTone
}): Promise<EdmCustomModule | null> {
  const existing = await getCustomModule(id)
  if (!existing) return null

  const name = patch.name ?? existing.name
  const description = patch.description !== undefined ? patch.description : existing.description
  const category = patch.category ?? existing.category
  const previewTone = patch.preview_tone ?? existing.preview_tone

  return queryOne<EdmCustomModule>(`
    UPDATE edm_custom_modules
    SET name = $1, description = $2, category = $3, preview_tone = $4, updated_at = NOW()
    WHERE id = $5
    RETURNING *
  `, [name, description, category, previewTone, id])
}

export async function deleteCustomModule(id: string): Promise<void> {
  await execute('DELETE FROM edm_custom_modules WHERE id = $1', [id])
}
