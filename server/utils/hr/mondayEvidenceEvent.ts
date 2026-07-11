export type MondayEvidenceChangeKind = 'assignment' | 'status' | 'archived' | 'deleted' | 'restored' | 'moved'

const lifecycleEvents: Record<string, MondayEvidenceChangeKind> = {
  item_archived: 'archived',
  subitem_archived: 'archived',
  item_deleted: 'deleted',
  subitem_deleted: 'deleted',
  item_restored: 'restored',
  subitem_restored: 'restored',
  item_moved_to_any_group: 'moved',
  item_moved_to_specific_group: 'moved',
  move_subitem: 'moved',
}

/** Convert an authenticated Monday event into content-free HR provenance. */
export function normalizeMondayEvidenceEvent(eventType: string | null, payload: any, allowedFields: string[]) {
  const type = String(eventType || '').toLowerCase()
  const lifecycle = lifecycleEvents[type]
  if (lifecycle) return { changeKind: lifecycle, fieldId: null }
  if (type !== 'change_column_value' && type !== 'change_subitem_column_value') return null

  const source = payload?.event || payload || {}
  const fieldId = String(source.columnId || source.column_id || '').trim()
  const fieldType = String(source.columnType || source.column_type || '').trim().toLowerCase()
  const allowed = new Set(allowedFields.map(field => field.trim().toLowerCase()))
  if (fieldType === 'people' && (allowed.has('assignee') || allowed.has('assignee_id') || allowed.has(fieldId.toLowerCase()))) {
    return { changeKind: 'assignment' as const, fieldId }
  }
  if (fieldType === 'status' && (allowed.has('status') || allowed.has(fieldId.toLowerCase()))) {
    return { changeKind: 'status' as const, fieldId }
  }
  return null
}
