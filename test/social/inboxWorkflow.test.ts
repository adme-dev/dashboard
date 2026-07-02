import { afterEach, describe, expect, it, vi } from 'vitest'
import { onInboundRecorded, type WorkflowDb, type WorkflowDeps } from '~~/server/utils/socialInbox/workflow'

function fakeDb(): WorkflowDb {
  return {
    queryOne: vi.fn(async (sql: string) => {
      if (/FROM social_sla_policies/.test(sql)) return { target_minutes: 120 }
      if (/sla_due_at FROM social_conversations/.test(sql)) return { sla_due_at: null }
      if (/assigned_to FROM social_conversations WHERE id/.test(sql)) return { assigned_to: null }
      if (/ORDER BY assigned_at DESC/.test(sql)) return null
      return null
    }),
    queryRows: vi.fn(async (sql: string) => {
      if (/FROM client_team_assignments/.test(sql)) return [{ team_member_id: 'user-1' }]
      return []
    }),
    execute: vi.fn(async () => 1)
  }
}

describe('onInboundRecorded', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts inbox automation workflow for a new inbound message after local workflow actions', async () => {
    const startAutomationWorkflow = vi.fn(async () => ({ ok: true }))
    const notifyAssigned = vi.fn(async () => {})
    const deps: WorkflowDeps = {
      notifyAssigned,
      startAutomationWorkflow
    }

    await onInboundRecorded(fakeDb(), deps, {
      conversationId: 'conv-1',
      clientId: 'client-1',
      channelType: 'comment',
      messageId: 'msg-1'
    })

    expect(notifyAssigned).toHaveBeenCalledWith('user-1', 'conv-1', 'client-1')
    expect(startAutomationWorkflow).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      clientId: 'client-1',
      messageId: 'msg-1',
      trigger: 'inbound'
    })
  })

  it('does not fail ingestion when workflow start fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const startAutomationWorkflow = vi.fn(async () => {
      throw new Error('workflow unavailable')
    })
    const deps: WorkflowDeps = {
      notifyAssigned: vi.fn(async () => {}),
      startAutomationWorkflow
    }

    await expect(onInboundRecorded(fakeDb(), deps, {
      conversationId: 'conv-1',
      clientId: 'client-1',
      channelType: 'comment',
      messageId: 'msg-1'
    })).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledWith('workflow.automation.error', {
      id: 'conv-1',
      error: 'workflow unavailable'
    })
  })
})
