// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import * as Vue from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'

const navigate = vi.fn()
// Compile the real page in memory: the unit-test Vite config has no Nuxt #app
// alias. Only that framework boundary is replaced; all page logic/template runs.
const filename = resolve(process.cwd(), 'app/pages/agency/audio/projects/index.vue')
const descriptor = parse(readFileSync(filename, 'utf8'), { filename }).descriptor
const compiled = compileScript(descriptor, { id: 'media-create-retry', inlineTemplate: true }).content
const code = ts.transpileModule(compiled, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const ProjectsPage = new Function('require', 'exports', `${code}; return exports.default`)((id: string) => {
  if (id === 'vue') return Vue
  if (id === '#app') return { navigateTo: navigate }
  throw new Error(`Unexpected page runtime import: ${id}`)
}, {})
const api = vi.fn()
const post = vi.fn()
const apps: App[] = []
const select = {
  props: ['modelValue', 'items', 'disabled'], emits: ['update:modelValue'],
  template: '<select :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
}
const stubs = {
  UButton: {
    props: ['label', 'disabled', 'loading'], emits: ['click'],
    template: '<button :disabled="disabled || loading" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>'
  },
  UModal: { props: ['open'], template: '<section v-if="open" role="dialog"><slot name="content" /></section>' },
  UFormField: { props: ['label'], template: '<div :data-field="label"><slot /></div>' },
  UInput: {
    props: ['modelValue', 'disabled'], emits: ['update:modelValue'],
    template: '<input :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  USelect: select, USelectMenu: select,
  UAlert: { props: ['title', 'description'], template: '<div role="alert">{{ title }} {{ description }}<slot name="actions" /></div>' },
  UIcon: { template: '<i />' }, USkeleton: { template: '<div />' },
  UTable: { template: '<div />' }, UBadge: { template: '<span />' },
  MediaVideoStudioWorkspaceHeader: { template: '<div />' },
  MediaVideoStudioProjectGallery: { template: '<div />' }
}
async function settle() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function button(host: HTMLElement, label: string) {
  const result = [...host.querySelectorAll('button')].find(el => el.textContent?.trim() === label)
  if (!result) throw new Error(`Missing button: ${label}`)
  return result
}
async function click(host: HTMLElement, label: string) {
  button(host, label).click()
  await settle()
}
async function title(host: HTMLElement, value: string) {
  const input = host.querySelector('[data-field="Project title"] input') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}
async function mount() {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(ProjectsPage) })
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub)
  apps.push(app)
  app.mount(host)
  await settle()
  await click(host, 'New project')
  await title(host, 'First project')
  return host
}
beforeEach(() => {
  navigate.mockReset()
  post.mockReset().mockRejectedValue(new Error('Response lost'))
  api.mockReset().mockImplementation((url: string, options?: { method?: string }) => {
    if (options?.method === 'POST') return post(url, options)
    return Promise.resolve(url === '/api/agency/clients' ? [] : { projects: [] })
  })
  vi.stubGlobal('$fetch', api)
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('useRoute', () => ({ query: { mediaType: 'audio' } }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  localStorage.clear()
})
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount()
  vi.unstubAllGlobals()
})

describe('media project creation ambiguity recovery', () => {
  it('retries a lost response with the exact body, idempotency key and audio seed', async () => {
    const host = await mount()
    await click(host, 'Create audio project')
    const original = JSON.parse(JSON.stringify(post.mock.calls[0]![1]))
    expect(original.headers['Idempotency-Key']).toMatch(/^media-create:/)
    expect(original.body.initialState.tracks.map((track: { kind: string }) => track.kind)).toEqual(['voiceover', 'music'])
    expect(host.textContent).toContain('may already have created a project')
    expect(navigate).not.toHaveBeenCalled()
    await click(host, 'Cancel')
    await click(host, 'New project')
    post.mockResolvedValueOnce({ project: { id: 'recovered-project' } })
    await click(host, 'Create audio project')
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]![1]).toEqual(original)
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/agency/audio/projects/recovered-project')
  })

  it('locks attempted details and rejects a changed fingerprint without rotating the key', async () => {
    const host = await mount()
    await click(host, 'Create audio project')
    const original = JSON.parse(JSON.stringify(post.mock.calls[0]![1]))
    for (const field of host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')) expect(field.disabled).toBe(true)
    // Simulate a stale component update despite disabled controls to exercise the request guard.
    await title(host, 'Changed details')
    await click(host, 'Create audio project')
    expect(post).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('Resolve the previous attempt before changing its details')
    await title(host, 'First project')
    await click(host, 'Create audio project')
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]![1]).toEqual(original)
  })

  it('requires explicit confirmation before starting a new request and audio seed', async () => {
    const host = await mount()
    await click(host, 'Create audio project')
    const original = JSON.parse(JSON.stringify(post.mock.calls[0]![1]))
    await click(host, 'Start a different project')
    await click(host, 'Keep previous attempt')
    await click(host, 'Create audio project')
    expect(post.mock.calls[1]![1]).toEqual(original)
    await click(host, 'Start a different project')
    await click(host, 'Start different project')
    const input = host.querySelector('[data-field="Project title"] input') as HTMLInputElement
    expect(input.disabled).toBe(false)
    expect(input.value).toBe('')
    await title(host, 'Explicitly new project')
    await click(host, 'Create audio project')
    expect(post).toHaveBeenCalledTimes(3)
    const fresh = post.mock.calls[2]![1]
    expect(fresh.headers['Idempotency-Key']).not.toBe(original.headers['Idempotency-Key'])
    expect(fresh.body.title).toBe('Explicitly new project')
    expect(fresh.body.initialState.tracks.map((track: { id: string }) => track.id)).not.toEqual(original.body.initialState.tracks.map((track: { id: string }) => track.id))
  })
})
