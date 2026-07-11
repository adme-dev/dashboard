export type MondaySourceState = 'active' | 'archived' | 'deleted'
export type MondayReconciliationStatus = 'current' | 'pending' | 'archived' | 'deleted'

export type MondayWebhookClassification =
  | { action: 'ignore' }
  | {
    action: 'reconcile'
    sourceState: MondaySourceState
    reconciliationStatus: MondayReconciliationStatus
  }

const ARCHIVED_EVENTS = new Set(['item_archived', 'subitem_archived', 'archive_pulse', 'archive_subitem'])
const DELETED_EVENTS = new Set(['item_deleted', 'subitem_deleted', 'delete_pulse', 'delete_subitem'])
const RESTORED_EVENTS = new Set(['item_restored', 'subitem_restored', 'restore_pulse', 'restore_subitem'])
const STRUCTURED_CHANGE_EVENTS = new Set([
  'change_column_value',
  'change_subitem_column_value',
  'change_name',
  'change_subitem_name',
  'create_item',
  'create_subitem',
  'item_moved_to_any_group',
  'item_moved_to_specific_group',
  'move_subitem',
])

/**
 * Classify authenticated board webhooks without treating excluded update/comment
 * content as HR evidence.
 * Supported event reference:
 * https://developer.monday.com/apps/docs/board-column-extension#set-up-webhooks
 */
export function classifyMondayWebhookEvent(eventType?: string | null): MondayWebhookClassification {
  const type = String(eventType || '').trim().toLowerCase()
  if (ARCHIVED_EVENTS.has(type)) return { action: 'reconcile', sourceState: 'archived', reconciliationStatus: 'archived' }
  if (DELETED_EVENTS.has(type)) return { action: 'reconcile', sourceState: 'deleted', reconciliationStatus: 'deleted' }
  if (RESTORED_EVENTS.has(type) || STRUCTURED_CHANGE_EVENTS.has(type)) {
    return { action: 'reconcile', sourceState: 'active', reconciliationStatus: 'pending' }
  }
  return { action: 'ignore' }
}
