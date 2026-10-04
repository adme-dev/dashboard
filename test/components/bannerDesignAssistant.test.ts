// @vitest-environment happy-dom
import { createApp, h, nextTick, reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DesignAssistant from '~~/app/components/banner/DesignAssistant.client.vue'

vi.mock('~/utils/banner-html-builder', () => ({ buildBannerHTML: vi.fn((key: string) => `<html><body>${key}</body></html>`) }))
const initialCanvas = () => ({ mrec: { layers: [], bgColor: '#ffffff' } })
const response = () => ({ reply: 'Refined the headline and added a story.', model: 'configured-quality', canvasData: { mrec: { layers: [], bgColor: '#000000' }, custom_500x800: { layers: [], bgColor: '#000000' } }, caption: 'Meet DriveAgent', suggestedSchedule: 'Next Tuesday morning' })
const fetchMock = vi.fn()
const applyMock = vi.fn()
const undoMock = vi.fn()
let state: { project: { id: string, clientId: string }, activeKey: string, bgColor: string, sets: ReturnType<typeof initialCanvas> }
let previous: ReturnType<typeof initialCanvas>
const cleanup: Array<() => void> = []
async function settle() {
  for (let i = 0; i < 5; i++) await nextTick()
}
async function mount(projectId = 'project-1') {
  const id = ref(projectId)
  const social = vi.fn()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(DesignAssistant, { open: true, projectId: id.value, onPrepareSocial: social }) })
  app.component('USlideover', { template: '<section><slot name="body"/></section>' })
  app.component('UFileUpload', { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input type="file" multiple :disabled="disabled" @change="$emit(\'update:modelValue\', Array.from($event.target.files))" />' })
  app.component('UIcon', { template: '<span/>' })
  app.component('UFormField', { props: ['label'], template: '<label>{{ label }}<slot/></label>' })
  app.component('UButton', { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>' })
  app.component('UTextarea', { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
  app.component('USelect', { props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' })
  app.component('UCheckbox', { props: ['modelValue', 'label'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)"/>{{ label }}</label>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<p role="alert">{{ title }} {{ description }}</p>' })
  app.component('UBadge', { props: ['label'], template: '<span>{{ label }}</span>' })
  app.mount(host)
  cleanup.push(() => {
    app.unmount()
    host.remove()
  })
  await settle()
  const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent === label)!
  const click = async (label: string) => {
    button(label).click()
    await settle()
  }
  const prompt = async (value: string) => {
    const input = host.querySelectorAll('textarea')[1]!
    input.value = value
    input.dispatchEvent(new Event('input'))
    await settle()
  }
  const request = async () => {
    await prompt('Improve this design')
    await click('Preview proposal')
  }
  const upload = async (files: File[]) => {
    const input = host.querySelector('input[type="file"]')!
    Object.defineProperty(input, 'files', { value: files, configurable: true })
    input.dispatchEvent(new Event('change'))
    await settle()
  }
  return { host, id, button, click, prompt, request, social, app, upload }
}
beforeEach(() => {
  sessionStorage.clear()
  fetchMock.mockReset().mockResolvedValue(response())
  applyMock.mockReset().mockImplementation((canvas) => {
    previous = structuredClone(initialCanvas())
    state.sets = JSON.parse(JSON.stringify(canvas))
  })
  undoMock.mockReset().mockImplementation(() => {
    state.sets = previous
  })
  state = reactive({ project: { id: 'project-1', clientId: 'client-1' }, activeKey: 'mrec', bgColor: '#ffffff', sets: initialCanvas() })
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('useBannerStudio', () => ({ state, getCanvasData: () => JSON.parse(JSON.stringify(state.sets)), applyAssistantCanvas: applyMock, undo: undoMock, canUndo: ref(true) }))
  vi.stubGlobal('useBannerFonts', () => ({ getExportCustomFonts: () => [] }))
})
afterEach(() => {
  cleanup.splice(0).forEach(fn => fn())
  vi.unstubAllGlobals()
})

describe('native Banner Studio design assistant', () => {
  it('previews a proposal without editing, applies explicitly, and supports undo', async () => {
    const view = await mount()
    await view.request()
    expect(applyMock).not.toHaveBeenCalled()
    expect(view.host.textContent).toContain('Model: configured-quality')
    expect(view.button('Prepare social export').disabled).toBe(true)
    expect(view.host.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts')
    await view.click('Apply to canvas')
    expect(applyMock).toHaveBeenCalledWith(response().canvasData)
    expect(view.button('Prepare social export').disabled).toBe(false)
    await view.click('Undo last canvas edit')
    expect(undoMock).toHaveBeenCalledOnce()
    expect(state.sets).toEqual(initialCanvas())
    expect(view.button('Prepare social export').disabled).toBe(true)
  })
  it('rejects a proposal after a canvas edit while the request was running', async () => {
    let resolve!: (data: unknown) => void
    fetchMock.mockImplementation(() => new Promise((done) => {
      resolve = done
    }))
    const view = await mount()
    await view.request()
    state.sets.mrec.bgColor = '#ff0000'
    resolve(response())
    await settle()
    expect(view.host.textContent).toContain('Canvas changed')
    expect(view.button('Apply to canvas').disabled).toBe(true)
    await view.click('Apply to canvas')
    expect(applyMock).not.toHaveBeenCalled()
  })
  it('ignores results when switching projects during a request', async () => {
    let resolve!: (data: unknown) => void
    fetchMock.mockImplementation(() => new Promise((done) => {
      resolve = done
    }))
    const view = await mount()
    await view.request()
    state.project.id = 'project-2'
    view.id.value = 'project-2'
    await settle()
    resolve(response())
    await settle()
    expect(view.host.querySelector('iframe')).toBeNull()
    expect(view.host.textContent).not.toContain('Refined the headline')
    expect(sessionStorage.getItem('banner-design-chat:v2:project-2:client-1')).toBeNull()
  })
  it('ignores an in-flight response after the same project changes client', async () => {
    let resolve!: (data: unknown) => void
    fetchMock.mockImplementation(() => new Promise((done) => {
      resolve = done
    }))
    const view = await mount()
    await view.request()
    state.project.clientId = 'client-2'
    resolve(response())
    await settle()
    expect(view.host.querySelector('iframe')).toBeNull()
    expect(view.host.textContent).not.toContain('Refined the headline')
    expect(applyMock).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('banner-design-chat:v2:project-1:client-2')).toBeNull()
  })
  it('clears proposals and isolates conversation when a saved project changes client', async () => {
    const view = await mount()
    await view.request()
    await view.click('Apply to canvas')
    state.project.clientId = 'client-2'
    await settle()
    expect(view.host.querySelector('iframe')).toBeNull()
    expect(view.host.querySelector('[role="log"]')).toBeNull()
    expect(view.host.querySelector('textarea')?.value).toBe('')
    expect(view.social).not.toHaveBeenCalled()
    await view.request()
    expect(fetchMock.mock.calls[1][1].body.history).toEqual([])
    state.project.clientId = 'client-1'
    await settle()
    expect(view.host.querySelector('iframe')).toBeNull()
    expect(view.host.querySelectorAll('[role="log"] > div')).toHaveLength(2)
  })
  it('allows previewing a new custom format and replaying the isolated preview', async () => {
    const view = await mount()
    await view.request()
    const select = view.host.querySelector('select')!
    expect([...select.options].map(o => o.value)).toContain('custom_500x800')
    select.value = 'custom_500x800'
    select.dispatchEvent(new Event('change'))
    await settle()
    const before = view.host.querySelector('iframe')!
    expect(before.getAttribute('width')).toBe('500')
    expect(before.getAttribute('height')).toBe('800')
    await view.click('Replay preview')
    expect(view.host.querySelector('iframe')).not.toBe(before)
  })
  it('refines an unapplied preview and includes bounded conversation context', async () => {
    const view = await mount()
    await view.request()
    await view.prompt('Make the headline larger')
    await view.click('Preview proposal')
    const body = fetchMock.mock.calls[1][1].body
    expect(body.canvasData).toEqual(response().canvasData)
    expect(body.history).toEqual([{ role: 'user', content: 'Improve this design' }, { role: 'assistant', content: response().reply }])
    expect(body.model).toBe('auto')
    expect(body.allowLocked).toBe(false)
  })
  it('hands caption and timing to social export only after applying and without publishing', async () => {
    const view = await mount()
    await view.request()
    await view.click('Prepare social export')
    expect(view.social).not.toHaveBeenCalled()
    await view.click('Apply to canvas')
    await view.click('Prepare social export')
    expect(view.social).toHaveBeenCalledWith({ caption: 'Meet DriveAgent', suggestedSchedule: 'Next Tuesday morning' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('keeps the canvas and editable prompt after a provider failure', async () => {
    fetchMock.mockRejectedValue(new Error('Provider offline'))
    const view = await mount()
    await view.request()
    expect(view.host.textContent).toContain('Could not prepare a design')
    expect(view.host.querySelectorAll('textarea')[1]?.value).toBe('Improve this design')
    expect(applyMock).not.toHaveBeenCalled()
    expect(state.sets).toEqual(initialCanvas())
  })
  it('restores bounded project history without restoring proposals', async () => {
    sessionStorage.setItem('banner-design-chat:v2:project-1:client-1', JSON.stringify({ brief: 'Approved brand', messages: Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `Message ${i}` })) }))
    const view = await mount()
    expect(view.host.querySelectorAll('[role="log"] > div')).toHaveLength(20)
    expect(view.host.querySelector('textarea')?.value).toBe('Approved brand')
    expect(view.host.querySelector('iframe')).toBeNull()
    await view.request()
    expect(fetchMock.mock.calls[0][1].body.history).toHaveLength(12)
    await view.click('Discard preview')
    expect(view.host.querySelector('iframe')).toBeNull()
    expect(applyMock).not.toHaveBeenCalled()
  })
  it('requires explicit opt-in for locked layers and passes selected model preference', async () => {
    const view = await mount()
    await view.click('Advanced options')
    const checkbox = view.host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
    const model = view.host.querySelector('select')!
    model.value = 'quality'
    model.dispatchEvent(new Event('change'))
    await settle()
    await view.request()
    expect(fetchMock.mock.calls[0][1].body).toMatchObject({ model: 'quality', allowLocked: true })
  })
  it('uploads a scoped visual reference, waits for analysis, and sends only its ID', async () => {
    const imageId = 'e1111111-1111-4111-8111-111111111111'
    let finish!: (value: unknown) => void
    fetchMock.mockImplementation((url: string) => url.endsWith('/references')
      ? new Promise((resolve) => { finish = resolve })
      : Promise.resolve({ ...response(), context: { brandKit: 'DriveAgent brand', clientStyleGuide: true, references: [{ id: imageId, name: 'layout.png', kind: 'image' }] } }))
    const view = await mount()
    await view.prompt('Use the spacing in my reference')
    await view.upload([new File(['image'], 'layout.png', { type: 'image/png' })])
    expect(view.button('Preview proposal').disabled).toBe(true)
    expect(view.host.textContent).toContain('Uploading and preparing layout.png')
    const body = fetchMock.mock.calls[0][1].body as FormData
    expect(body.get('projectId')).toBe('project-1')
    expect(body.get('file')).toBeInstanceOf(File)
    finish({ reference: { id: imageId, name: 'layout.png', kind: 'image', description: 'Large headline above a quiet footer', url: 'https://assets.example/ref.png', analysisModel: 'workers-ai/vision' } })
    await settle()
    expect(view.host.textContent).toContain('Visual analysis ready')
    expect(view.host.textContent).toContain('workers-ai/vision')
    expect(view.host.querySelector('img')?.getAttribute('src')).toBe('https://assets.example/ref.png')
    await view.click('Review visual analysis')
    expect(view.host.textContent).toContain('Large headline above a quiet footer')
    await view.click('Preview proposal')
    expect(fetchMock.mock.calls[1][1].body.referenceIds).toEqual([imageId])
    expect(fetchMock.mock.calls[1][1].body).not.toHaveProperty('references')
    expect(view.host.textContent).toContain('Brand kit included: DriveAgent brand')
    expect(view.host.textContent).toContain('Client style guide included.')
  })

  it('persists reference metadata and guide counts, then removes a guide from subsequent requests', async () => {
    const guideId = 'e2222222-2222-4222-8222-222222222222'
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/references')
      ? { reference: { id: guideId, kind: 'guide', name: 'brand.md', description: 'Use generous spacing', guideCharacterCount: 20 } }
      : response()))
    const view = await mount()
    await view.upload([new File(['Use generous spacing'], 'brand.md', { type: 'text/markdown' })])
    expect(view.host.textContent).toContain('Guide text ready')
    expect(view.host.textContent).toContain('20/12,000 guide characters')
    const saved = JSON.parse(sessionStorage.getItem('banner-design-chat:v2:project-1:client-1')!)
    expect(saved.references).toHaveLength(1)
    expect(saved.references[0]).not.toHaveProperty('file')
    expect(saved.references[0]).not.toHaveProperty('guideText')
    const reopened = await mount()
    expect(reopened.host.textContent).toContain('brand.md')
    reopened.host.querySelector<HTMLButtonElement>('[aria-label="Remove brand.md"]')!.click()
    await settle()
    await reopened.request()
    expect(fetchMock.mock.calls.at(-1)![1].body.referenceIds).toEqual([])
  })

  it('rejects unsupported PDFs, oversized images, and guide text above the total limit', async () => {
    const view = await mount()
    await view.upload([new File(['pdf'], 'guide.pdf', { type: 'application/pdf' })])
    expect(view.host.textContent).toContain('PDF is not supported')
    expect(fetchMock).not.toHaveBeenCalled()
    await view.upload([new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })])
    expect(view.host.textContent).toContain('5 MB or smaller')
    await view.upload([new File(['a'.repeat(12001)], 'large.md', { type: 'text/markdown' })])
    expect(view.host.textContent).toContain('12,000 characters or fewer')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('enforces the combined guide limit against restored references before uploading', async () => {
    sessionStorage.setItem('banner-design-chat:v2:project-1:client-1', JSON.stringify({ references: [{ id: 'e5555555-5555-4555-8555-555555555555', kind: 'guide', name: 'existing.md', description: 'Existing guidance', guideCharacterCount: 7000 }] }))
    const view = await mount()
    await view.upload([new File(['a'.repeat(6000)], 'extra.md', { type: 'text/markdown' })])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(view.host.textContent).toContain('total 12,000 characters or fewer')
    expect(view.host.querySelectorAll('article')).toHaveLength(1)
  })

  it('does not attach an image when visual analysis fails', async () => {
    fetchMock.mockRejectedValue({ data: { statusMessage: 'Visual reference analysis is unavailable' } })
    const view = await mount()
    await view.upload([new File(['image'], 'layout.png', { type: 'image/png' })])
    expect(view.host.textContent).toContain('Visual reference analysis is unavailable')
    expect(view.host.textContent).not.toContain('Visual analysis ready')
    expect(view.host.querySelectorAll('article')).toHaveLength(0)
    expect(applyMock).not.toHaveBeenCalled()
  })

  it('limits visual references to three and retains existing references on provider failure', async () => {
    let uploads = 0
    fetchMock.mockImplementation(() => {
      uploads++
      return Promise.resolve({ reference: { id: `e3333333-3333-4333-8333-${String(uploads).padStart(12, '0')}`, kind: 'image', name: `ref-${uploads}.png`, description: 'Visual description' } })
    })
    const view = await mount()
    await view.upload(Array.from({ length: 4 }, (_, i) => new File(['image'], `${i}.png`, { type: 'image/png' })))
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(view.host.textContent).toContain('at most three reference images')
    fetchMock.mockRejectedValue({ data: { statusMessage: 'Visual reference analysis is unavailable' } })
    await view.upload([new File(['Guide'], 'guide.txt', { type: 'text/plain' })])
    expect(view.host.textContent).toContain('Visual reference analysis is unavailable')
    expect(view.host.querySelectorAll('article')).toHaveLength(3)
  })

  it('ignores a late upload after the same project changes client', async () => {
    let finish!: (value: unknown) => void
    fetchMock.mockImplementation(() => new Promise((resolve) => {
      finish = resolve
    }))
    const view = await mount()
    await view.upload([new File(['image'], 'layout.png', { type: 'image/png' })])
    state.project.clientId = 'client-2'
    finish({ reference: { id: 'e4444444-4444-4444-8444-444444444444', kind: 'image', name: 'layout.png', description: 'Old client reference' } })
    await settle()
    expect(view.host.querySelectorAll('article')).toHaveLength(0)
    expect(view.host.textContent).not.toContain('Old client reference')
    expect(sessionStorage.getItem('banner-design-chat:v2:project-1:client-2')).toBeNull()
  })
})
