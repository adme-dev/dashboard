// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { computed, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import { AI_PERSONA_OPTIONS } from '../../app/utils/aiPersonas'
import { vueScriptDeclarations } from '../helpers/vueScriptDeclarations'

const chat = readFileSync('app/pages/agency/ai/chat.vue', 'utf8')
function declarations(names: string[], scope: Record<string, unknown>) {
  const source = vueScriptDeclarations(chat, names)
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  return new Function(...Object.keys(scope), `${code}; return { ${names.join(', ')} }`)(...Object.values(scope))
}

describe('compact AI chat composer', () => {
  it('keeps the inherited picker label concise and describes the saved focus separately', () => {
    const selectedPersona = ref<string | null>(null)
    const state = declarations(['personaItems', 'personaTooltip'], {
      computed, AI_PERSONA_OPTIONS, defaultPersona: ref('finance'), selectedPersona
    })
    expect(state.personaItems.value[0]).toEqual({ label: 'My Assistant', value: '__default__' })
    expect(state.personaTooltip.value).toContain('Finance')
    selectedPersona.value = 'general'
    expect(state.personaTooltip.value).toContain('Agency Assistant')
  })

  it('keeps idle voice guidance quiet but surfaces requested, blocked, unavailable and failed states', () => {
    const permission = ref('granted')
    const available = ref(true)
    const error = ref<string | null>(null)
    const requested = ref(false)
    const state = declarations(['showVoiceGuide'], {
      computed, microphonePermission: permission, voiceAvailable: available, voiceError: error, voiceGuideRequested: requested
    })
    expect(state.showVoiceGuide.value).toBe(false)
    permission.value = 'denied'
    expect(state.showVoiceGuide.value).toBe(true)
    permission.value = 'granted'
    available.value = false
    expect(state.showVoiceGuide.value).toBe(true)
    available.value = true
    error.value = 'Voice processing failed'
    expect(state.showVoiceGuide.value).toBe(true)
    error.value = null
    requested.value = true
    expect(state.showVoiceGuide.value).toBe(true)
  })

  it('preserves Enter to send, Shift+Enter for a new line, and mention keyboard priority', () => {
    const send = vi.fn()
    const mention = vi.fn()
    const open = ref(false)
    const state = declarations(['handleKeydown'], { mentionDropdownOpen: open, handleMentionKeydown: mention, handleSend: send })
    const enter = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() }
    state.handleKeydown(enter)
    expect(send).toHaveBeenCalledOnce()
    expect(enter.preventDefault).toHaveBeenCalledOnce()
    state.handleKeydown({ key: 'Enter', shiftKey: true, preventDefault: vi.fn() })
    expect(send).toHaveBeenCalledOnce()
    open.value = true
    state.handleKeydown(enter)
    expect(mention).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledOnce()
  })

  it('exposes the Nuxt textarea element for mention insertion and caret focus', async () => {
    const state = declarations(['messageTextarea', 'inputRef'], { ref, computed })
    const textarea = document.createElement('textarea')
    state.messageTextarea.value = { textareaRef: textarea }
    expect(state.inputRef.value).toBe(textarea)
    const input = ref('Hello @Fin')
    const entities = ref<Array<{ id: string }>>([])
    const close = vi.fn()
    const mention = declarations(['selectMention'], {
      mentionedEntities: entities, closeMentionDropdown: close, messageInput: input,
      mentionAtPosition: ref(6), mentionQuery: ref('Fin'), inputRef: state.inputRef, nextTick
    })
    mention.selectMention({ id: 'client-1', type: 'client', title: 'Finance client' })
    textarea.value = input.value
    await nextTick()
    expect(input.value).toBe('Hello @Finance client ')
    expect(entities.value[0]?.id).toBe('client-1')
    expect(textarea.selectionStart).toBe(input.value.length)
    expect(close).toHaveBeenCalledOnce()
  })
})
