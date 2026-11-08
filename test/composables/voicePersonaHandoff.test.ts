import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { useVoiceChat } from '../../app/composables/useVoiceChat'
import { useVoiceSession } from '../../app/composables/useVoiceSession'

describe('voice focus handoff', () => {
  beforeEach(() => {
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('onUnmounted', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each(['marketing', 'general', null, undefined])('encodes focus %s distinctly from absence', async (persona) => {
    const fetcher = vi.fn(async (_url: string, _options: { body: FormData }) => ({}))
    vi.stubGlobal('$fetch', fetcher)
    await useVoiceChat().sendVoiceMessage('conversation', new Blob(['audio']), undefined, persona)
    const body = fetcher.mock.calls[0]?.[1].body as FormData
    expect(body.get('persona')).toBe(persona === undefined ? null : JSON.stringify(persona))
  })

  it('passes the selected workflow identity in voice multipart data', async () => {
    const fetcher = vi.fn(async (_url: string, _options: { body: FormData }) => ({}))
    vi.stubGlobal('$fetch', fetcher)
    const workflow = { key: 'budget-review', versionId: 'version-1' }
    await useVoiceChat().sendVoiceMessage('conversation', new Blob(['audio']), undefined, 'marketing', workflow)
    expect((fetcher.mock.calls[0]?.[1].body as FormData).get('workflow')).toBe(JSON.stringify(workflow))
  })

  it('reads the current focus for every hands-free session turn', async () => {
    const focus = ref<string | null>('marketing')
    let finishRecording: ((blob: Blob) => void) | undefined
    const sendVoiceMessage = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal('$fetch', vi.fn())
    vi.stubGlobal('useVoiceChat', () => ({
      startRecording: vi.fn(() => new Promise<Blob>((resolve) => { finishRecording = resolve })),
      sendVoiceMessage,
      cancelRecording: vi.fn(), stopAudio: vi.fn(), volumeLevel: ref(0), error: ref(null)
    }))
    const session = useVoiceSession({
      ensureConversation: async () => 'conversation',
      getPersona: () => focus.value,
      getWorkflow: () => ({ key: 'budget-review', versionId: 'version-1' }),
      onTurn: vi.fn(), onAssistantNote: vi.fn(), onProposalResolved: vi.fn()
    })
    await session.start()
    focus.value = 'finance'
    const blob = new Blob(['audio'])
    finishRecording!(blob)
    await vi.waitFor(() => expect(sendVoiceMessage).toHaveBeenCalledWith('conversation', blob, undefined, 'finance', { key: 'budget-review', versionId: 'version-1' }))
    session.stop()
  })
})
