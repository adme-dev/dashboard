import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ensureObjectRoot, providerSafeInputSchema, stripNullProperties, widenOptionalPropertiesToNullable } from '~~/server/utils/ai/providerToolSchema'

// Loose JSON-schema view for assertions.
type J = { type?: string, properties: Record<string, J & { anyOf?: unknown[] }>, oneOf?: unknown, anyOf?: unknown }
const validate = async (schema: ReturnType<typeof providerSafeInputSchema>, value: unknown) => await schema.validate!(value)

describe('provider-safe tool input schemas', () => {
  const params = z.object({ clientId: z.string().uuid().optional(), cursor: z.string().optional(), limit: z.number().int().default(25), name: z.string() })

  it('advertises optional properties as nullable and keeps required ones strict', async () => {
    const json = await providerSafeInputSchema(params).jsonSchema as unknown as J
    expect(json.type).toBe('object')
    expect(json.properties.cursor.anyOf).toEqual([expect.objectContaining({ type: 'string' }), { type: 'null' }])
    expect(json.properties.name).toEqual(expect.objectContaining({ type: 'string' }))
    expect(json.properties.name.anyOf).toBeUndefined()
  })

  it('treats null as "not set" for optional fields (gpt-oss behaviour) and still applies defaults', async () => {
    const result = await validate(providerSafeInputSchema(params), { name: 'x', cursor: null, clientId: null, limit: null })
    expect(result).toEqual({ success: true, value: { name: 'x', limit: 25 } })
  })

  it('still rejects genuinely invalid input', async () => {
    expect((await validate(providerSafeInputSchema(params), { cursor: null })).success).toBe(false)
    expect((await validate(providerSafeInputSchema(params), { name: 'x', clientId: 'not-a-uuid' })).success).toBe(false)
  })

  it('passes null through to a schema that genuinely accepts it', async () => {
    const nullable = z.object({ note: z.string().nullable() })
    expect(await validate(providerSafeInputSchema(nullable), { note: null })).toEqual({ success: true, value: { note: null } })
  })

  it('wraps a discriminated union in a top-level object (the create_asset shape)', async () => {
    const union = z.discriminatedUnion('kind', [z.object({ kind: z.literal('a'), a: z.string() }), z.object({ kind: z.literal('b'), b: z.number() })])
    const json = await providerSafeInputSchema(union).jsonSchema as unknown as J
    expect(json.type).toBe('object')
    expect(json.oneOf ?? json.anyOf).toBeDefined()
    expect(await validate(providerSafeInputSchema(union), { kind: 'b', b: 2 })).toEqual({ success: true, value: { kind: 'b', b: 2 } })
  })

  it('widens nested optional properties and strips nested nulls', () => {
    const widened = widenOptionalPropertiesToNullable({ type: 'object', properties: { inner: { type: 'object', properties: { x: { type: 'string' } } } }, required: ['inner'] }) as J
    expect(widened.properties.inner.properties.x.anyOf).toEqual([{ type: 'string' }, { type: 'null' }])
    expect(stripNullProperties({ a: null, b: { c: null, d: 1 }, e: [null, 1] })).toEqual({ b: { d: 1 }, e: [null, 1] })
    expect(ensureObjectRoot({ oneOf: [] })).toEqual({ type: 'object', oneOf: [] })
  })
})
