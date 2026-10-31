// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import Importer from '../../app/components/banner/MotorStackBrandKitImport.vue'

const brands = [{ id: 'gwm', name: 'GWM', existingKitId: null }, { id: 'kia', name: 'Kia', existingKitId: 'kit-kia' }]
const result = (id: string) => ({ status: 'imported', brandId: id, brandName: id, kitId: `kit-${id}`, warnings: ['No dark logo supplied'], counts: { fonts: 2, logos: 1, colors: 3 } })
let app: ReturnType<typeof Vue.createApp> | undefined
let host: HTMLDivElement
async function settle() {
  for (let index = 0; index < 8; index++) await Promise.resolve()
  await Vue.nextTick()
}
function button(label: string) {
  const match = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === label)
  if (!match) throw new Error(`Button not found: ${label}`)
  return match
}
async function mount(write: ReturnType<typeof vi.fn>) {
  const data = Vue.ref({ brands, warnings: ['Review source assets before use'] })
  const error = Vue.ref(null)
  const status = Vue.ref('idle')
  const execute = vi.fn(async () => {
    status.value = 'success'
  })
  vi.stubGlobal('useFetch', () => ({ data, error, status, execute }))
  vi.stubGlobal('$fetch', write)
  const complete = vi.fn()
  app = Vue.createApp(Importer, { open: true, onComplete: complete })
  app.component('UModal', Vue.defineComponent({ props: ['open', 'title', 'description', 'dismissible', 'close'], setup: (props, { slots }) => () => props.open ? Vue.h('section', { 'data-dismissible': props.dismissible }, [props.title, slots.body?.(), slots.footer?.()]) : null }))
  app.component('UButton', Vue.defineComponent({ props: ['disabled', 'label'], setup: (props, { slots }) => () => Vue.h('button', { disabled: props.disabled }, slots.default?.() || props.label) }))
  app.component('UAlert', Vue.defineComponent({ props: ['title', 'description'], setup: props => () => Vue.h('aside', [props.title, props.description]) }))
  for (const name of ['UBadge', 'UIcon', 'UProgress']) app.component(name, Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h('span', slots.default?.()) }))
  app.mount(host)
  await settle()
  return { complete, execute }
}
beforeEach(() => {
  for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
  host = document.createElement('div')
})
afterEach(() => {
  app?.unmount()
  app = undefined
  vi.unstubAllGlobals()
})

describe('MotorStack brand-kit import UI', () => {
  it('loads for review, starts only on click, and reloads the library after the batch', async () => {
    const write = vi.fn(async (_url, options) => result(options.body.brandId))
    const { complete, execute } = await mount(write)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(write).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Existing kit will be kept')
    expect(host.textContent).toContain('Review source assets before use')
    button('Import all 2 brands').click()
    await settle()
    expect(write.mock.calls.map(call => call[1].body)).toEqual([{ brandId: 'gwm' }, { brandId: 'kia' }])
    expect(host.textContent).toContain('2 / 2 processed')
    expect(host.textContent).toContain('2 font files · 1 logos · 3 colours')
    expect(host.textContent).toContain('No dark logo supplied')
    expect(complete).toHaveBeenCalledTimes(1)
    expect(host.textContent).not.toContain('Import all')
  })

  it('shows failures and retries only failed brands', async () => {
    const write = vi.fn().mockRejectedValueOnce({ data: { statusMessage: 'Font unavailable' } }).mockResolvedValueOnce(result('kia')).mockResolvedValueOnce(result('gwm'))
    await mount(write)
    button('Import all 2 brands').click()
    await settle()
    expect(host.textContent).toContain('Font unavailable')
    button('Retry 1 failed').click()
    await settle()
    expect(write.mock.calls.map(call => call[1].body.brandId)).toEqual(['gwm', 'kia', 'gwm'])
    expect(host.textContent).not.toContain('Font unavailable')
    expect(host.textContent).toContain('2 imported')
  })

  it('prevents dismissal while saving, and stops only after the current response', async () => {
    let finish!: (value: ReturnType<typeof result>) => void
    const write = vi.fn(() => new Promise<ReturnType<typeof result>>((resolve) => {
      finish = resolve
    }))
    const { complete } = await mount(write)
    button('Import all 2 brands').click()
    await settle()
    expect(host.querySelector('section')?.getAttribute('data-dismissible')).toBe('false')
    button('Stop after current').click()
    await settle()
    expect(host.textContent).toContain('Stopping after the current brand finishes')
    expect(complete).not.toHaveBeenCalled()
    finish(result('gwm'))
    await settle()
    expect(write).toHaveBeenCalledTimes(1)
    expect(complete).toHaveBeenCalledTimes(1)
    expect(button('Continue 1 remaining')).toBeTruthy()
    expect(host.querySelector('section')?.getAttribute('data-dismissible')).toBe('true')
  })
})
