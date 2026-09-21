// Wire mirror of @xeroflow/protocol collection-definition.ts; golden tests protect compatibility.
import { z } from 'zod'
import {
  PageStudioContentRecordSchema as BusinessContentRecordSchema,
  PageStudioContentScopeSchema as ContentScopeSchema
} from './businessContent'
import { contentScopeKey } from './collectionScope'

const StableIdSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/)

export const CollectionIdentitySchema = StableIdSchema.refine(
  id => !['__proto__', 'constructor', 'prototype'].includes(id),
  'Reserved collection or field identity'
)
const label = z.string().trim().min(1).max(120)
const safeInteger = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const common = {
  id: CollectionIdentitySchema,
  label,
  required: z.boolean(),
  visibility: z.enum(['private', 'public'])
}
export const CollectionFieldSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        ...common,
        maxLength: z.number().int().min(1).max(4000).optional(),
        minLength: z.number().int().min(0).max(4000).optional(),
        type: z.literal('text')
      })
      .strict(),
    z
      .object({
        ...common,
        max: safeInteger.optional(),
        min: safeInteger.optional(),
        type: z.literal('integer')
      })
      .strict(),
    z.object({ ...common, type: z.literal('boolean') }).strict(),
    z.object({ ...common, type: z.literal('date') }).strict(),
    z.object({ ...common, type: z.literal('instant') }).strict(),
    z
      .object({
        ...common,
        precision: z.number().int().min(1).max(18),
        scale: z.number().int().min(0).max(6),
        type: z.literal('decimal')
      })
      .strict(),
    z
      .object({
        ...common,
        options: z
          .array(z.object({ id: CollectionIdentitySchema, label }).strict())
          .min(1)
          .max(100),
        type: z.literal('enum')
      })
      .strict()
  ])
  .superRefine((field, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (field.type === 'text' && (field.minLength ?? 0) > (field.maxLength ?? 4000)) {
      issue('Invalid text bounds')
    }
    if (
      field.type === 'integer'
      && (field.min ?? Number.MIN_SAFE_INTEGER) > (field.max ?? Number.MAX_SAFE_INTEGER)
    ) {
      issue('Invalid integer bounds')
    }
    if (field.type === 'decimal' && field.scale > field.precision) {
      issue('Decimal scale exceeds precision')
    }
    if (
      field.type === 'enum'
      && new Set(field.options.map(option => option.id)).size !== field.options.length
    ) {
      issue('Duplicate enum option identity')
    }
  })
export type CollectionField = z.infer<typeof CollectionFieldSchema>

export const CollectionDefinitionSchema = z
  .object({
    displayFieldId: CollectionIdentitySchema,
    fields: z.array(CollectionFieldSchema).min(1).max(30),
    formatVersion: z.literal(1),
    id: CollectionIdentitySchema,
    label,
    scope: ContentScopeSchema,
    version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
  })
  .strict()
  .superRefine((definition, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (new Set(definition.fields.map(field => field.id)).size !== definition.fields.length) {
      issue('Duplicate field identity')
    }
    if (!definition.fields.some(field => field.id === definition.displayFieldId)) {
      issue('Missing display field')
    }
    if (new TextEncoder().encode(JSON.stringify(definition)).byteLength > 128_000) {
      issue('Collection definition exceeds byte limit')
    }
  })
export type CollectionDefinition = z.infer<typeof CollectionDefinitionSchema>
export type CollectionValues = Record<string, string | number | boolean>

const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/
function validDecimal(value: string, field: Extract<CollectionField, { type: 'decimal' }>): boolean {
  if (!DECIMAL_PATTERN.test(value)) {
    return false
  }
  const [whole = '', fraction = ''] = value.replace('-', '').split('.')
  if (fraction.length !== field.scale || (field.scale === 0 && value.includes('.'))) {
    return false
  }
  if (whole !== '0' && whole.length > field.precision - field.scale) {
    return false
  }
  return !(value.startsWith('-') && BigInt(`${whole}${fraction}`) === 0n)
}
function valueSchema(field: CollectionField): z.ZodType {
  switch (field.type) {
    case 'text':
      return z
        .string()
        .min(field.minLength ?? 0)
        .max(field.maxLength ?? 4000)
        .refine(value => !field.required || value.trim().length > 0, 'Required text is empty')
    case 'integer':
      return safeInteger.min(field.min ?? Number.MIN_SAFE_INTEGER).max(field.max ?? Number.MAX_SAFE_INTEGER)
    case 'boolean':
      return z.boolean()
    case 'date':
      return z.iso.date()
    case 'instant':
      return z.iso.datetime({ precision: 3 })
    case 'decimal':
      return z
        .string()
        .max(20)
        .refine(value => validDecimal(value, field), 'Invalid canonical decimal')
    case 'enum':
      return z
        .string()
        .refine(value => field.options.some(option => option.id === value), 'Unknown enum option')
    default:
      throw new Error('Unsupported field type')
  }
}

export function parseCollectionValues(input: unknown, values: unknown): CollectionValues {
  const definition = CollectionDefinitionSchema.parse(input)
  const shape = Object.fromEntries(
    definition.fields.map((field) => {
      const schema = valueSchema(field)
      return [field.id, field.required ? schema : schema.optional()]
    })
  )
  const parsed = z.object(shape).strict().parse(values) as CollectionValues
  if (Object.values(parsed).some(value => value === undefined)) {
    throw new Error('Omit absent optional fields')
  }
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > 128_000) {
    throw new Error('Record exceeds byte limit')
  }
  return parsed
}

function narrowerBounds(beforeMin: number, beforeMax: number, afterMin: number, afterMax: number): boolean {
  return afterMin > beforeMin || afterMax < beforeMax
}

function narrows(before: CollectionField, after: CollectionField): boolean {
  if (before.type !== after.type || (!before.required && after.required)) {
    return true
  }
  if (before.type === 'text' && after.type === 'text') {
    return narrowerBounds(
      before.minLength ?? 0,
      before.maxLength ?? 4000,
      after.minLength ?? 0,
      after.maxLength ?? 4000
    )
  }
  if (before.type === 'integer' && after.type === 'integer') {
    return narrowerBounds(
      before.min ?? Number.MIN_SAFE_INTEGER,
      before.max ?? Number.MAX_SAFE_INTEGER,
      after.min ?? Number.MIN_SAFE_INTEGER,
      after.max ?? Number.MAX_SAFE_INTEGER
    )
  }

  if (before.type === 'enum' && after.type === 'enum') {
    return before.options.some(option => !after.options.some(next => next.id === option.id))
  }
  if (before.type === 'decimal' && after.type === 'decimal') {
    return after.scale !== before.scale || after.precision < before.precision
  }
  return false
}
export function classifyCollectionChange(
  beforeInput: unknown,
  afterInput: unknown
): 'compatible' | 'review-required' | 'migration-required' {
  const before = CollectionDefinitionSchema.parse(beforeInput)
  const after = CollectionDefinitionSchema.parse(afterInput)
  if (before.id !== after.id || contentScopeKey(before.scope) !== contentScopeKey(after.scope)) {
    return 'migration-required'
  }
  let visibilityChange = false
  for (const field of before.fields) {
    const next = after.fields.find(candidate => candidate.id === field.id)
    if (!next || narrows(field, next)) {
      return 'migration-required'
    }
    if (next.visibility !== field.visibility) {
      visibilityChange = true
    }
  }
  if (after.fields.some(field => field.required && !before.fields.some(old => old.id === field.id))) {
    return 'migration-required'
  }
  return visibilityChange ? 'review-required' : 'compatible'
}

/** A pure projection only, not publication or access authorization. Both pinned
 * and current definitions must authorize a field's visibility and value type. */
export function projectCollectionValues(
  pinnedInput: unknown,
  currentInput: unknown,
  input: unknown
): CollectionValues {
  const pinned = CollectionDefinitionSchema.parse(pinnedInput)
  const current = CollectionDefinitionSchema.parse(currentInput)
  if (pinned.id !== current.id || contentScopeKey(pinned.scope) !== contentScopeKey(current.scope)) {
    throw new Error('Collection scope denied')
  }
  const values = parseCollectionValues(pinned, input)
  return Object.fromEntries(
    pinned.fields.flatMap((field) => {
      const active = current.fields.find(candidate => candidate.id === field.id)
      const value = values[field.id]
      if (
        field.visibility !== 'public'
        || active?.visibility !== 'public'
        || active.type !== field.type
        || !Object.hasOwn(values, field.id)
        || value === undefined
      ) {
        return []
      }
      if (!valueSchema(active).safeParse(value).success) {
        return []
      }
      return [[field.id, value]]
    })
  )
}

/** Preserve all v1 values for an explicit reviewed mapping. Infer no public data. */
export function preserveLegacyContentRecord(input: unknown) {
  return {
    legacy: BusinessContentRecordSchema.parse(input),
    publicValues: {},
    reviewRequired: true as const
  }
}
