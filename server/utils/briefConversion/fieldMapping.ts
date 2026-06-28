// Revives G3: brief_templates.field_mapping was configured but applied nowhere, so a
// brief's captured intake dead-ended at conversion. This pure unit turns the mapping
// (Record<briefFieldKey, targetField>) + the brief's flattened field values into the
// concrete data the conversion carries into the job: known target fields + human-readable
// description lines. No DB, no side effects — the caller decides what to do with `mapped`.

export interface AppliedFieldMapping {
  /** target field -> the raw brief value (only for mapping entries that had a value). */
  mapped: Record<string, unknown>
  /** "Label: value" lines suitable for appending to a task/project description. */
  descriptionLines: string[]
}

function stringifyValue(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(stringifyValue).filter(Boolean).join(', ')
  if (typeof v === 'object') {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  return String(v)
}

/** 'requested_deadline' / 'targetAudience' -> 'Requested Deadline' / 'Target Audience'. */
function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase boundary
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase())
}

export function applyFieldMapping(
  fieldMapping: Record<string, string> | null | undefined,
  fields: Record<string, unknown> | null | undefined,
): AppliedFieldMapping {
  const mapped: Record<string, unknown> = {}
  const descriptionLines: string[] = []
  if (!fieldMapping || !fields) return { mapped, descriptionLines }

  for (const [briefKey, target] of Object.entries(fieldMapping)) {
    if (!target || typeof target !== 'string') continue
    const raw = fields[briefKey]
    if (raw == null || raw === '') continue
    const text = stringifyValue(raw)
    if (!text) continue
    mapped[target] = raw
    descriptionLines.push(`${humanize(target)}: ${text}`)
  }

  return { mapped, descriptionLines }
}
