// app/utils/crmFieldControls.ts
// Maps a field_type to the Nuxt UI control used to render/edit it. Shared by RecordForm
// (input) and RecordsTable (display formatting) so they never drift.

export type CrmControl = 'input' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date' | 'tags' | 'relation' | 'rating'

export function controlForFieldType(t: string): CrmControl {
  switch (t) {
    case 'long_text': return 'textarea'
    case 'number':
    case 'currency': return 'number'
    case 'rating': return 'rating'
    case 'dropdown':
    case 'status': return 'select'
    case 'checkbox': return 'checkbox'
    case 'date': return 'date'
    case 'tags': return 'tags'
    case 'relation': return 'relation'
    default: return 'input' // text, email, phone, link, location
  }
}

export function formatCell(t: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (t === 'currency') return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(v))
  if (t === 'checkbox') return v ? 'Yes' : 'No'
  if (t === 'tags') return Array.isArray(v) ? v.join(', ') : String(v)
  if (t === 'rating') {
    const n = Math.max(0, Math.min(5, Math.round(Number(v))))
    return '★'.repeat(n) + '☆'.repeat(5 - n)
  }
  return String(v)
}
