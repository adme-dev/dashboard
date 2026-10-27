// @vitest-environment happy-dom
import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Companion from '../../app/components/banner/inspector/Companion.vue'
import type { Layer } from '../../app/types/banner-studio'

const fixture = vi.hoisted(() => ({ api: null as Record<string, unknown> | null }))
vi.mock('../../app/composables/useBannerCompanion', () => ({ useBannerCompanion: () => fixture.api }))
const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).forEach(dispose => dispose()))
async function mount() {
  const api = {
    opened: ref(false),
    loading: ref(false),
    error: ref(''),
    status: ref('missing-request'),
    request: ref<{ requestId: string } | null>(null),
    proposal: ref<{ text: string, engine: { name: string, version: string } } | null>(null),
    reviewed: ref(false),
    blockReason: ref(''),
    canApply: ref(false),
    beforeLayer: ref<Partial<Layer> | null>(null),
    previewLayer: ref<Partial<Layer> | null>(null),
    open: vi.fn(() => {
      api.opened.value = true
    }),
    close: vi.fn(),
    downloadRequest: vi.fn(),
    importFile: vi.fn(),
    apply: vi.fn(),
    discard: vi.fn()
  }
  fixture.api = api
  const app = createApp({ render: () => h(Companion) })
  app.component('UButton', {
    props: ['label', 'disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>'
  })
  app.component('UFormField', {
    props: ['label', 'description'],
    template: '<label>{{ label }}<slot/><small>{{ description }}</small></label>'
  })
  app.component('UFileUpload', {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<input type="file" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.files[0])" />'
  })
  app.component('UCheckbox', {
    props: ['modelValue', 'label', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<label><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}</label>'
  })
  app.component('UAlert', { props: ['title', 'description'], template: '<aside>{{ title }} {{ description }}</aside>' })
  const host = document.createElement('div')
  document.body.appendChild(host)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  const get = <T extends HTMLElement = HTMLElement>(id: string) =>
    host.querySelector<T>(`[data-testid="companion-${id}"]`)!
  get('open').click()
  await nextTick()
  return { api, host, get }
}

describe('companion inspector review controls', () => {
  it('explains missing session authority and unsupported headings before accepting files', async () => {
    const { api, host, get } = await mount()
    expect(get('missing-request').textContent).toContain('this session')
    expect(get<HTMLInputElement>('file').disabled).toBe(true)
    get('download').click()
    expect(api.downloadRequest).toHaveBeenCalledOnce()
    api.blockReason.value = 'Exact font face unavailable; substitution forbidden'
    await nextTick()
    expect(get('unsupported').textContent).toContain('Unsupported selected heading')
    expect(get<HTMLButtonElement>('download').disabled).toBe(true)
    expect(host.textContent).toContain('substitution forbidden')
    get('close').click()
    expect(api.close).toHaveBeenCalledOnce()
  })
  it('offers before/after exact words and unverified declaration, with review-gated apply', async () => {
    const { api, get } = await mount()
    api.request.value = { requestId: 'session' }
    api.proposal.value = { text: 'Come say hello', engine: { name: 'PhotoCraft', version: '0.16.0' } }
    api.beforeLayer.value = {
      w: 280,
      h: 100,
      fontFamily: 'Source Sans 3',
      fontWeight: 700,
      fontSize: 24,
      color: '#112233',
      text: 'Welcome home'
    }
    api.previewLayer.value = { ...api.beforeLayer.value, text: 'Come say hello' }
    await nextTick()
    expect(get<HTMLInputElement>('file').disabled).toBe(false)
    expect(get('before').textContent).toBe('Welcome home')
    expect(get('after').textContent).toBe('Come say hello')
    expect(get('after').style.fontFamily).toContain('Source Sans 3')
    expect(get('after').style.fontWeight).toBe('700')
    expect(get('after').parentElement!.style.backgroundColor).toBe('#ffffff')
    api.previewLayer.value = { ...api.previewLayer.value, color: '#ffffff' }
    await nextTick()
    expect(get('after').parentElement!.style.backgroundColor).toBe('#111827')
    expect(get('engine').textContent).toContain('unverified')
    expect(get<HTMLButtonElement>('apply').disabled).toBe(true)
    const checkbox = get('reviewed').querySelector<HTMLInputElement>('input')!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
    await nextTick()
    expect(api.reviewed.value).toBe(true)
    api.canApply.value = true
    await nextTick()
    get('apply').click()
    expect(api.apply).toHaveBeenCalledOnce()
    get('discard').click()
    expect(api.discard).toHaveBeenCalledOnce()
  })
  it('shows stale/error guidance as text and makes cancellation available during reads', async () => {
    const { api, host, get } = await mount()
    api.error.value = 'The document or selection changed. Download a new companion request.'
    api.status.value = 'stale'
    api.loading.value = true
    await nextTick()
    expect(get('error').textContent).toContain('selection changed')
    expect(get('close').textContent).toBe('Cancel companion review')
    get('close').click()
    expect(api.close).toHaveBeenCalledOnce()
    api.loading.value = false
    api.error.value = ''
    api.status.value = 'applied'
    await nextTick()
    expect(get('applied').textContent).toContain('Undo restores')
    expect(host.querySelector('[data-testid="companion-missing-request"]')).toBeNull()
  })
})
