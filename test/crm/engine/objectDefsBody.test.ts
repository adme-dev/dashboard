import { describe, it, expect } from 'vitest'
import { ObjectDefCreate, FieldDefCreate } from '~~/server/utils/crm/engine/schemas'

// A valid v4 UUID (variant nibble 8) — zod 4's .uuid() validates version/variant bits,
// unlike zod 3. An all-1s string is NOT a valid UUID under zod 4.
const UUID = '11111111-1111-4111-8111-111111111111'

describe('engine schemas', () => {
  it('rejects an object key with uppercase/spaces', () => {
    const r = ObjectDefCreate.safeParse({ client_id: UUID, vertical_key: 'retail', key: 'Bad Key', label: 'X', label_plural: 'Xs' })
    expect(r.success).toBe(false)
  })

  it('accepts a valid object def and defaults has_pipeline=false', () => {
    const r = ObjectDefCreate.safeParse({ client_id: UUID, vertical_key: 'retail', key: 'product', label: 'Product', label_plural: 'Products' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.has_pipeline).toBe(false)
  })

  it('rejects an unknown field_type', () => {
    const r = FieldDefCreate.safeParse({ client_id: UUID, key: 'x', label: 'X', field_type: 'wizard' })
    expect(r.success).toBe(false)
  })
})
