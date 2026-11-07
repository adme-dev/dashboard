import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import type { AiConversation } from '../../app/types'
import { useAiChat } from '../../app/composables/useAiChat'

const conversation = (id: string): AiConversation => ({
  id, userId: 'staff', title: null, model: 'test', systemContext: {}, messageCount: 0,
  lastMessageAt: null, isArchived: false, isPinned: false, pinnedAt: null,
  createdAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z'
})

// Execute the production composable with real Vue refs, replacing only Nuxt state and HTTP.
describe('AI chat personal focus defaults', () => {
  let fetcher: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const state = new Map()
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('useState', (key: string, init: () => unknown) => {
      if (!state.has(key)) state.set(key, ref(init()))
      return state.get(key)
    })
    fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/my-assistant')) return { personaKey: 'finance' }
      if (url.endsWith('/messages')) return { message: { id: 'reply', role: 'assistant' } }
      return conversation('new')
    })
    vi.stubGlobal('$fetch', fetcher)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('inherits the saved personal focus with a null inheritance marker', async () => {
    const chat = useAiChat()
    await chat.loadAssistantDefaults()
    expect(chat.selectedPersona.value).toBeNull()
    expect(chat.defaultPersona.value).toBe('finance')
    await chat.createConversation()
    await chat.sendMessage('Help with cashflow')
    expect(fetcher.mock.calls.at(-1)?.[1].body.persona).toBeNull()
  })

  it('uses private runtime metadata even when tools are explicitly disabled', async () => {
    const chat = useAiChat()
    expect(chat.chatToolsEnabled.value).toBeNull()
    fetcher.mockResolvedValueOnce({ personaKey: 'finance', chatRuntime: { toolsEnabled: false, source: 'binding' } })
    await chat.loadAssistantDefaults()
    expect(chat.chatToolsEnabled.value).toBe(false)
    fetcher.mockResolvedValueOnce({ personaKey: 'finance', chatRuntime: { toolsEnabled: true, source: 'runtime_config' } })
    await chat.loadAssistantDefaults()
    expect(chat.chatToolsEnabled.value).toBe(true)
  })

  it('fails closed when loaded settings do not contain runtime metadata', async () => {
    const chat = useAiChat()
    await chat.loadAssistantDefaults()
    expect(chat.chatToolsEnabled.value).toBe(false)
  })

  it('preserves an explicit General choice before the first message', async () => {
    const chat = useAiChat()
    chat.selectedPersona.value = 'general'
    await chat.createConversation()
    await chat.sendMessage('Help across the agency')
    expect(fetcher.mock.calls.at(-1)?.[1].body.persona).toBe('general')
  })

  it('starts a new conversation without carrying the previous conversation focus', async () => {
    const chat = useAiChat()
    chat.activeConversation.value = conversation('old')
    chat.selectedPersona.value = 'marketing'
    await chat.createConversation()
    expect(chat.selectedPersona.value).toBeNull()
  })

  it('loads conversation overrides and clears them when the next conversation inherits', async () => {
    const chat = useAiChat()
    fetcher.mockResolvedValueOnce({ conversation: conversation('explicit'), messages: [], persona: 'general' })
    await chat.loadConversation('explicit')
    expect(chat.selectedPersona.value).toBe('general')
    fetcher.mockResolvedValueOnce({ conversation: conversation('inherited'), messages: [], persona: null })
    await chat.loadConversation('inherited')
    expect(chat.selectedPersona.value).toBeNull()
    await chat.sendMessage('Use my saved focus')
    expect(fetcher.mock.calls.at(-1)?.[1].body.persona).toBeNull()
  })

  it('sends null to clear an existing explicit override when inheritance is selected', async () => {
    const chat = useAiChat()
    fetcher.mockResolvedValueOnce({ conversation: conversation('explicit'), messages: [], persona: 'general' })
    await chat.loadConversation('explicit')
    chat.selectedPersona.value = null
    await chat.sendMessage('Use my personal default again')
    expect(fetcher.mock.calls.at(-1)?.[1].body.persona).toBeNull()
  })

  it('clears an archived conversation override before the next chat', async () => {
    const chat = useAiChat()
    chat.activeConversation.value = conversation('old')
    chat.selectedPersona.value = 'sales'
    await chat.archiveConversation('old')
    expect(chat.selectedPersona.value).toBeNull()
  })
})
