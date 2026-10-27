// @vitest-environment happy-dom
import { createApp, h, nextTick, ref, computed } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Repair from '../../app/components/banner/inspector/LetteringRepair.vue'

const fixture = vi.hoisted(() => ({ api: null as Record<string, unknown> | null }))
vi.mock('../../app/composables/useBannerLetteringRepair', () => ({ useBannerLetteringRepair: () => fixture.api }))
vi.stubGlobal('computed', computed)
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(fn => fn()))
async function mount() {
  const api = {
    opened: ref(false), loading: ref(false), error: ref(''), region: ref({ x: 0.1, y: 0.2, w: 0.7, h: 0.3 }),
    sourceWording: ref(''), wording: ref(''), instruction: ref('Reconstruct background'), regionReviewed: ref(false), reviewed: ref(false),
    showOriginal: ref(false), proposal: ref<{ backgroundAsset: { url: string }, evidence: { provider: string, model: string }, warnings: string[] } | null>(null), candidate: ref<{ text: { text: string } } | null>(null), fontFamily: ref('Arial'), fontSize: ref(24), color: ref('#111111'),
    fonts: ['Arial', 'Georgia', 'Impact'], canApply: ref(false), validRegion: ref(true), blockReason: ref(''),
    open: vi.fn(() => { api.opened.value = true }), generate: vi.fn(), apply: vi.fn(), discard: vi.fn(), close: vi.fn()
  }
  fixture.api = api
  const layer = { id: 1, type: 'image', src: '/original.png', name: 'Poster' }
  vi.stubGlobal('useBannerStudio', () => ({ selectedLayer: ref(layer) }))
  const app = createApp({ render: () => h(Repair) })
  app.component('UButton', { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>' })
  app.component('UFormField', { props: ['label', 'description'], template: '<label>{{ label }}<slot/><small>{{ description }}</small></label>' })
  for (const name of ['UInput', 'UTextarea']) app.component(name, { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' })
  app.component('UCheckbox', { props: ['modelValue', 'label', 'disabled'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)"/>{{ label }}</label>' })
  app.component('USelect', { props: ['modelValue', 'items'], template: '<select><option v-for="item in items">{{ item }}</option></select>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<aside>{{ title }} {{ description }}</aside>' })
  const host = document.createElement('div')
  document.body.appendChild(host)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  const button = (name: string) => [...host.querySelectorAll('button')].find(el => el.textContent === name)!
  button('Rebuild lettering').click()
  await nextTick()
  return { api, host, button }
}

describe('lettering repair inspector', () => {
  it('shows a source-relative outline and accessible percentage fields; review and wording gate generation', async () => {
    const { api, host, button } = await mount()
    const outline = host.querySelector<HTMLElement>('[data-testid="lettering-repair-region-outline"]')!
    expect(outline.style.left).toBe('10%')
    expect(outline.style.top).toBe('20%')
    const left = host.querySelector<HTMLInputElement>('[aria-label="Left (%)"]')!
    left.value = '25'
    left.dispatchEvent(new Event('input'))
    await nextTick()
    expect(api.region.value.x).toBe(0.25)
    expect(outline.style.left).toBe('25%')
    expect(button('Generate repaired background preview').disabled).toBe(true)
    for (const [label, value] of [['Repair source wording', 'Old heading'], ['Repair exact new wording', 'New heading']]) {
      const input = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
      input.value = value
      input.dispatchEvent(new Event('input'))
    }
    const check = host.querySelector<HTMLInputElement>('[data-testid="lettering-repair-region-reviewed"] input')!
    check.checked = true
    check.dispatchEvent(new Event('change'))
    await nextTick()
    expect(button('Generate repaired background preview').disabled).toBe(false)
    button('Generate repaired background preview').click()
    expect(api.generate).toHaveBeenCalledOnce()
  })
  it('shows full background separately from native canvas review and exposes cancel/discard/apply', async () => {
    const { api, host, button } = await mount()
    api.loading.value = true
    await nextTick()
    button('Cancel repair request').click()
    expect(api.close).toHaveBeenCalledOnce()
    api.loading.value = false
    api.candidate.value = { text: { text: 'New heading' } }
    api.proposal.value = { backgroundAsset: { url: '/full-repaired.png' }, evidence: { provider: 'fixture', model: 'fixture' }, warnings: ['Review edges'] }
    await nextTick()
    expect(host.querySelector('[data-testid="lettering-repair-background"]')?.getAttribute('src')).toBe('/full-repaired.png')
    expect(host.textContent).toContain('editable text')
    expect(host.querySelector('[aria-label="Repair font size"]')).not.toBeNull()
    expect(button('Apply repaired lettering').disabled).toBe(true)
    api.canApply.value = true
    await nextTick()
    button('Apply repaired lettering').click()
    expect(api.apply).toHaveBeenCalledOnce()
    button('Discard preview').click()
    expect(api.discard).toHaveBeenCalledOnce()
  })
})
