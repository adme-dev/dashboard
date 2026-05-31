// server/utils/crm/engine/types.ts
// Shared types for the CRM custom-objects engine (Phase B).

export const FIELD_TYPES = [
  'text', 'long_text', 'number', 'currency', 'date', 'status', 'dropdown',
  'checkbox', 'rating', 'link', 'email', 'phone', 'location', 'tags', 'relation',
] as const
export type FieldType = typeof FIELD_TYPES[number]

export type RelationTarget = 'person' | 'company'

export interface ObjectDef {
  id: string
  client_id: string
  vertical_key: string
  key: string
  label: string
  label_plural: string
  icon: string | null
  has_pipeline: boolean
  position: number
}

export interface EngineFieldDef {
  id: string
  client_id: string
  object_def_id: string
  key: string
  label: string
  field_type: FieldType
  options: string[]
  relation_target: RelationTarget | null
  is_required: boolean
  is_title: boolean
  position: number
}

export interface EngineRecord {
  id: string
  client_id: string
  object_def_id: string
  data: Record<string, unknown>
  stage_id: string | null
  created_at: string
  updated_at: string
}
