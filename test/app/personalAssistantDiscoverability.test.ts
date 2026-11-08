import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'
import ts from 'typescript'
import { vueScriptDeclarations } from '../helpers/vueScriptDeclarations'

const layout = readFileSync('app/layouts/agency.vue', 'utf8')
const chat = readFileSync('app/pages/agency/ai/chat.vue', 'utf8')

describe('My Assistant discoverability', () => {
  it('uses server-resolved runtime metadata for both the picker and hands-free readiness', () => {
    const source = vueScriptDeclarations(chat, ['publicAiToolsEnabled', 'aiToolsEnabled', 'handsFreeVoiceAvailable'])
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
    const enabled = ref<boolean | null>(null)
    const load = new Function('computed', 'useRuntimeConfig', 'chatToolsEnabled', 'voiceAvailable',
      `${code}; return { aiToolsEnabled, handsFreeVoiceAvailable }`)
    const state = load(computed, () => ({ public: { aiToolsEnabled: true } }), enabled, ref(true))
    expect(state.aiToolsEnabled.value).toBe(true)
    enabled.value = false
    expect(state.aiToolsEnabled.value).toBe(false)
    expect(state.handsFreeVoiceAvailable.value).toBe(false)
    enabled.value = true
    expect(state.handsFreeVoiceAvailable.value).toBe(true)
  })

  it('links to personal settings beside the all-staff AI Chat navigation', () => {
    expect(layout).toMatch(/label: 'AI Chat'[\s\S]*?label: 'My Assistant', icon: '[^']+', to: '\/agency\/ai\/my-assistant'/)
  })

  it('links directly from chat to personal settings and offers the inherited focus', () => {
    expect(chat).toContain('to="/agency/ai/my-assistant"')
    expect(chat).toContain('My Assistant')
    expect(chat).toContain('My Assistant default')
    expect(chat).toContain('v-model="personaSelection"')
  })
})
