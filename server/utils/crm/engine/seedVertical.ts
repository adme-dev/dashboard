// server/utils/crm/engine/seedVertical.ts
// On vertical assign, instantiate the vertical's object templates into per-client
// crm_object_defs + crm_field_defs + crm_stages. `planSeedInserts` is the pure,
// unit-tested core; `seedVerticalFromTemplate` runs it in a transaction (idempotent).
import { transaction, queryRows } from '~~/server/utils/db'
import type { FieldType, RelationTarget } from './types'

export interface TemplateField {
  key: string
  label: string
  field_type: FieldType
  options: string[]
  relation_target: RelationTarget | null
  is_required: boolean
  is_title: boolean
  position: number
}
export interface TemplateStage {
  code: string
  name: string
  probability: number
  sort_order: number
  color: string
  is_won: boolean
  is_lost: boolean
}
export interface ObjectTemplate {
  object_key: string
  label: string
  label_plural: string
  icon: string | null
  has_pipeline: boolean
  position: number
  fields: TemplateField[]
  stages: TemplateStage[]
}

export interface SeedPlan {
  objects: Array<{ client_id: string, vertical_key: string, key: string, label: string, label_plural: string, icon: string | null, has_pipeline: boolean, position: number }>
  fieldsByObjectKey: Record<string, TemplateField[]>
  stagesByObjectKey: Record<string, Array<TemplateStage & { client_id: string }>>
}

export function planSeedInserts(clientId: string, verticalKey: string, templates: ObjectTemplate[]): SeedPlan {
  const plan: SeedPlan = { objects: [], fieldsByObjectKey: {}, stagesByObjectKey: {} }
  for (const t of templates) {
    plan.objects.push({
      client_id: clientId, vertical_key: verticalKey, key: t.object_key,
      label: t.label, label_plural: t.label_plural, icon: t.icon ?? null,
      has_pipeline: t.has_pipeline, position: t.position,
    })
    plan.fieldsByObjectKey[t.object_key] = t.fields
    if (t.has_pipeline && t.stages.length) {
      plan.stagesByObjectKey[t.object_key] = t.stages.map(s => ({ ...s, client_id: clientId }))
    }
  }
  return plan
}

// Idempotent: object/field upserts use ON CONFLICT; stages are scoped by a
// per-object code prefix so re-seeding does not duplicate.
export async function seedVerticalFromTemplate(clientId: string, verticalKey: string): Promise<void> {
  const templates = await queryRows<any>(
    `SELECT object_key, label, label_plural, icon, has_pipeline, position, fields, stages
       FROM crm_object_templates WHERE vertical_key = $1 ORDER BY position`,
    [verticalKey],
  )
  if (!templates.length) return
  const plan = planSeedInserts(clientId, verticalKey, templates.map(t => ({
    object_key: t.object_key, label: t.label, label_plural: t.label_plural, icon: t.icon,
    has_pipeline: t.has_pipeline, position: t.position,
    fields: Array.isArray(t.fields) ? t.fields : JSON.parse(t.fields),
    stages: Array.isArray(t.stages) ? t.stages : JSON.parse(t.stages),
  })))

  await transaction(async (db) => {
    for (const o of plan.objects) {
      const res = await db.query(
        `INSERT INTO crm_object_defs (client_id, vertical_key, key, label, label_plural, icon, has_pipeline, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (client_id, key) DO UPDATE SET deleted_at = NULL, updated_at = NOW()
         RETURNING id`,
        [o.client_id, o.vertical_key, o.key, o.label, o.label_plural, o.icon, o.has_pipeline, o.position],
      )
      const objectDefId = res.rows[0].id as string
      for (const f of plan.fieldsByObjectKey[o.key] ?? []) {
        await db.query(
          `INSERT INTO crm_field_defs (client_id, object_def_id, key, label, field_type, options, relation_target, is_required, is_title, position)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
           ON CONFLICT (object_def_id, key) DO NOTHING`,
          [o.client_id, objectDefId, f.key, f.label, f.field_type, JSON.stringify(f.options ?? []),
            f.relation_target ?? null, f.is_required, f.is_title, f.position],
        )
      }
      for (const s of plan.stagesByObjectKey[o.key] ?? []) {
        // Stage code namespaced by object key so multiple pipeline objects per client don't collide.
        const code = `${o.key}:${s.code}`
        await db.query(
          `INSERT INTO crm_stages (client_id, code, name, probability, sort_order, color, is_won, is_lost)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT DO NOTHING`,
          [s.client_id, code, s.name, s.probability, s.sort_order, s.color, s.is_won, s.is_lost],
        )
      }
    }
  })
}
