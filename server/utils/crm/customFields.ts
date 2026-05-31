// server/utils/crm/customFields.ts
// Validates a custom_fields value object against the client's field definitions.
// Unknown keys are dropped; invalid values throw with the offending key in the message.

export interface FieldDef {
  key: string
  field_type: string
  options: string[]
}

export function validateCustomFields(
  defs: FieldDef[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const byKey = new Map(defs.map(d => [d.key, d]))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values ?? {})) {
    const def = byKey.get(k)
    if (!def) continue // drop unknown
    if (v === null || v === '') continue
    if (def.field_type === 'number' || def.field_type === 'currency' || def.field_type === 'rating') {
      if (typeof v !== 'number' && Number.isNaN(Number(v))) {
        throw new Error(`Invalid number for field "${k}"`)
      }
      out[k] = Number(v)
      continue
    }
    if ((def.field_type === 'dropdown' || def.field_type === 'status') && def.options.length) {
      if (!def.options.includes(String(v))) {
        throw new Error(`Invalid option for field "${k}"`)
      }
    }
    out[k] = v
  }
  return out
}
