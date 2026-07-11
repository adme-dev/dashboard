import { describe, expect, it } from 'vitest'
import { classifyMondayWebhookEvent } from '~~/server/utils/mondayWebhookReconcile'

describe('classifyMondayWebhookEvent', () => {
  it('preserves archived and deleted source state without deleting local work', () => {
    expect(classifyMondayWebhookEvent('item_archived')).toEqual({ action: 'reconcile', sourceState: 'archived', reconciliationStatus: 'archived' })
    expect(classifyMondayWebhookEvent('subitem_deleted')).toEqual({ action: 'reconcile', sourceState: 'deleted', reconciliationStatus: 'deleted' })
  })

  it('marks structured changes and restores pending', () => {
    expect(classifyMondayWebhookEvent('change_name')).toEqual({ action: 'reconcile', sourceState: 'active', reconciliationStatus: 'pending' })
    expect(classifyMondayWebhookEvent('item_restored')).toEqual({ action: 'reconcile', sourceState: 'active', reconciliationStatus: 'pending' })
    expect(classifyMondayWebhookEvent('change_subitem_column_value')).toEqual({ action: 'reconcile', sourceState: 'active', reconciliationStatus: 'pending' })
  })

  it('ignores excluded update content and unknown event types', () => {
    expect(classifyMondayWebhookEvent('create_update')).toEqual({ action: 'ignore' })
    expect(classifyMondayWebhookEvent('edit_update')).toEqual({ action: 'ignore' })
    expect(classifyMondayWebhookEvent('unexpected_event')).toEqual({ action: 'ignore' })
  })
})
