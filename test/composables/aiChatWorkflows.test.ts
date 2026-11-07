import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useAiChat } from '../../app/composables/useAiChat'

const shortcut = {
  key: 'marketing-budget', versionId: 'version-2', version: 2, label: 'Review budgets',
  description: 'Review client pacing', prompt: 'Review the budget for [client].', persona: 'marketing',
  group: 'Marketing', tools: ['get_budget_status'], sources: []
}
const conversation = { id: 'conversation', messageCount: 0, title: null }
const fetcher = vi.fn()
beforeEach(() => {
  const state = new Map()
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('useState', (key: string, init: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(init()))
    return state.get(key)
  })
  vi.stubGlobal('$fetch', fetcher)
  fetcher.mockReset().mockImplementation(async (url: string) => {
    if (url.endsWith('/skills')) return { skills: [shortcut], canManage: false }
    if (url.endsWith('/messages')) return { message: { id: 'message', role: 'assistant' } }
    if (url.endsWith('/conversations')) return conversation
    return { conversation, messages: [], persona: null }
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('role workflow selection', () => {
  it('loads only the eligible server catalog and selects without sending', async () => {
    const chat = useAiChat()
    await chat.loadWorkflows()
    expect(chat.workflows.value).toEqual([shortcut])
    chat.selectWorkflow(shortcut)
    expect(chat.selectedWorkflow.value).toEqual(shortcut)
    expect(chat.selectedPersona.value).toBe('marketing')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('ignores a shortcut which is absent from the current eligible catalog', async () => {
    const chat = useAiChat()
    chat.selectWorkflow(shortcut)
    expect(chat.selectedWorkflow.value).toBeNull()
  })

  it('sends edited text and immutable workflow identity only after explicit submission', async () => {
    const chat = useAiChat()
    await chat.loadWorkflows()
    chat.selectWorkflow(shortcut)
    chat.activeConversation.value = conversation as never
    await chat.sendMessage('Review the budget for Acme and explain pacing.')
    expect(fetcher.mock.calls.at(-1)?.[1].body).toMatchObject({
      content: 'Review the budget for Acme and explain pacing.', persona: 'marketing',
      workflow: { key: 'marketing-budget', versionId: 'version-2' }
    })
    expect(fetcher.mock.calls.at(-1)?.[1].body.workflow).not.toHaveProperty('tools')
  })

  it('clears the selected workflow when focus changes', async () => {
    const chat = useAiChat()
    await chat.loadWorkflows()
    chat.selectWorkflow(shortcut)
    chat.selectedPersona.value = 'finance'
    await nextTick()
    expect(chat.selectedWorkflow.value).toBeNull()
  })

  it.each(['create', 'load', 'archive'])('clears stale selection on conversation %s', async (action) => {
    const chat = useAiChat()
    await chat.loadWorkflows()
    chat.selectWorkflow(shortcut)
    chat.activeConversation.value = conversation as never
    if (action === 'create') await chat.createConversation()
    if (action === 'load') await chat.loadConversation('next')
    if (action === 'archive') await chat.archiveConversation('conversation')
    expect(chat.selectedWorkflow.value).toBeNull()
  })
})
