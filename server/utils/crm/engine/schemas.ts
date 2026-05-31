// server/utils/crm/engine/schemas.ts
// Zod schemas shared between the engine's API routes (so they can be unit-tested).
import { z } from 'zod'
import { FIELD_TYPES } from './types'

export const KEY_RE = /^[a-z0-9_]+$/

export const ObjectDefCreate = z.object({
  client_id: z.string().uuid(),
  vertical_key: z.string().min(1),
  key: z.string().min(1).regex(KEY_RE),
  label: z.string().min(1),
  label_plural: z.string().min(1),
  icon: z.string().nullable().optional(),
  has_pipeline: z.boolean().optional().default(false),
  position: z.coerce.number().int().optional().default(0),
})

export const FieldDefCreate = z.object({
  client_id: z.string().uuid(),
  key: z.string().min(1).regex(KEY_RE),
  label: z.string().min(1),
  field_type: z.enum(FIELD_TYPES),
  options: z.array(z.string()).optional().default([]),
  relation_target: z.enum(['person', 'company']).nullable().optional(),
  is_required: z.boolean().optional().default(false),
  is_title: z.boolean().optional().default(false),
  position: z.coerce.number().int().optional().default(0),
})
