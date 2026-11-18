import { jsonSchema, zodSchema, type Schema } from 'ai'
import type { z } from 'zod'

/**
 * Tool input schemas as the chat providers actually need them.
 *
 * Groq validates tool-call arguments against the JSON schema server-side, and gpt-oss models
 * routinely send `null` for optional fields they do not want to set (e.g. `cursor: null`).
 * Without this, the whole turn fails with `tool_use_failed`. Claude never does this, so the MCP
 * path is unaffected. We therefore:
 *   1. advertise every optional property as also accepting `null`,
 *   2. guarantee a top-level `type: "object"` (a discriminated union otherwise produces a bare
 *      `oneOf`, which OpenAI-compatible providers reject — same fix as `toMcpInputSchema`), and
 *   3. validate with the tool's own zod schema, retrying once with `null`s removed so a `null`
 *      means "not set" while a schema that genuinely accepts `null` still receives it.
 */
type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)

function allowsNull(schema: unknown): boolean {
  if (!isObject(schema)) return true
  const type = schema.type
  if (type === 'null' || (Array.isArray(type) && type.includes('null'))) return true
  for (const key of ['anyOf', 'oneOf'] as const) {
    const options = schema[key]
    if (Array.isArray(options) && options.some(allowsNull)) return true
  }
  return false
}

/** Recursively widen optional object properties to accept null. Pure; returns a new schema. */
export function widenOptionalPropertiesToNullable(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(widenOptionalPropertiesToNullable)
  if (!isObject(schema)) return schema
  const out: JsonObject = {}
  for (const [key, value] of Object.entries(schema)) out[key] = widenOptionalPropertiesToNullable(value)
  if (isObject(out.properties)) {
    const required = new Set(Array.isArray(out.required) ? out.required as string[] : [])
    const properties: JsonObject = {}
    for (const [name, property] of Object.entries(out.properties)) {
      properties[name] = required.has(name) || allowsNull(property) ? property : { anyOf: [property, { type: 'null' }] }
    }
    out.properties = properties
  }
  return out
}

export function ensureObjectRoot(schema: JsonObject): JsonObject {
  return schema.type === 'object' ? schema : { type: 'object', ...schema }
}

/** Remove null-valued object properties recursively (array items are kept as-is). */
export function stripNullProperties(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNullProperties)
  if (!isObject(value)) return value
  const out: JsonObject = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== null) out[key] = stripNullProperties(entry)
  }
  return out
}

export function providerSafeInputSchema<T>(schema: z.ZodType<T>): Schema<T> {
  const base = zodSchema(schema as never) as Schema<T>
  return jsonSchema<T>(
    async () => widenOptionalPropertiesToNullable(ensureObjectRoot(await base.jsonSchema as JsonObject)) as never,
    {
      validate: (value) => {
        let result = schema.safeParse(value)
        if (!result.success) {
          const retry = schema.safeParse(stripNullProperties(value))
          if (retry.success) result = retry
        }
        return result.success ? { success: true, value: result.data } : { success: false, error: result.error }
      }
    }
  )
}
