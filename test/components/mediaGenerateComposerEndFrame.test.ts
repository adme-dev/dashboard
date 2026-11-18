// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import MediaGenerateComposer from '~~/app/components/media/MediaGenerateComposer.vue'
import { getVideoGenerationModel } from '~~/server/utils/video-generation/modelRegistry'

let app: App | undefined
afterEach(() => {
  app?.unmount()
  app = undefined
  vi.unstubAllGlobals()
})

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

function mountComposer(models: object[]) {
  const calls: { url: string, body?: Record<string, unknown> }[] = []
  const api = vi.fn(async (url: string, options?: { method?: string, body?: Record<string, unknown> }) => {
    calls.push({ url, body: options?.body })
    if (url === '/api/agency/video/generation/models') return { models }
    if (url === '/api/agency/video/generation/source-assets/from-timeline-still') return { id: `source-${options?.body?.clipId}` }
    if (url === '/api/agency/video/generation/jobs') return { job: { id: 'job-1' } }
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('$fetch', api)
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  app = createApp({
    render: () => h(MediaGenerateComposer, {
      active: true,
      projectId: 'project-end-frame-test',
      timelineStills: [{ clipId: 'front', label: 'Front three-quarter' }, { clipId: 'rear', label: 'Rear three-quarter' }],
      defaultAspect: '16:9'
    })
  })
  const slotStub = { template: '<div><slot /></div>' }
  for (const name of ['UAlert', 'USkeleton', 'UIcon', 'UTextarea', 'UPopover', 'UFormField', 'UBadge', 'UTooltip']) app.component(name, slotStub)
  app.component('UButton', { props: ['label', 'disabled'], template: '<button :disabled="disabled"><slot />{{ label }}</button>' })
  const selectStub = {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><option value=""></option><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>`
  }
  app.component('USelect', selectStub)
  app.component('USelectMenu', selectStub)
  const host = document.createElement('div')
  app.mount(host)
  return { host, calls }
}

function choose(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}
const stillPickers = (host: HTMLElement) => [...host.querySelectorAll<HTMLSelectElement>('select')]
  .filter(select => [...select.options].some(option => option.value === 'front'))

describe('MediaGenerateComposer start & end frames', () => {
  const seedance = { ...getVideoGenerationModel('aigateway/seedance-i2v')!, label: 'Seedance' }
  const vidu = { ...getVideoGenerationModel('aigateway/vidu-i2v')!, label: 'Vidu Q3' }

  it('sends the start frame then the end frame to an end-frame model', async () => {
    const { host, calls } = mountComposer([seedance, vidu])
    await flush()

    const workflowPicker = host.querySelector<HTMLSelectElement>('select[aria-label="What to make"]')!
    expect([...workflowPicker.options].map(option => option.value)).toContain('start-end-frames')
    choose(workflowPicker, 'start-end-frames')
    await flush()

    const modelPicker = host.querySelector<HTMLSelectElement>('select[aria-label="Model"]')!
    expect([...modelPicker.options].map(option => option.value).filter(Boolean)).toEqual([vidu.id])
    expect(host.textContent).toContain('Start frame')
    expect(host.textContent).toContain('End frame')

    // A template fills the prompt; same image mode, so the workflow is kept.
    const template = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Vehicle hero motion'))!
    template.click()
    await flush()

    choose(stillPickers(host)[0]!, 'front')
    await flush()
    choose(stillPickers(host)[0]!, 'rear')
    await flush()

    const generate = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Generate')!
    generate.click()
    await flush()

    const job = calls.find(call => call.url === '/api/agency/video/generation/jobs')
    expect(job?.body).toMatchObject({ mode: 'image-to-video', modelId: vidu.id, sourceAssetIds: ['source-front', 'source-rear'] })
  })

  it('does not offer start & end frames when no model supports an end frame', async () => {
    const { host } = mountComposer([seedance])
    await flush()
    const workflowPicker = host.querySelector<HTMLSelectElement>('select[aria-label="What to make"]')!
    expect([...workflowPicker.options].map(option => option.value).filter(Boolean)).toEqual(['animate-image'])
  })

  it('a plain animate-image job still sends exactly one source frame', async () => {
    const { host, calls } = mountComposer([seedance, vidu])
    await flush()
    const template = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Vehicle hero motion'))!
    template.click()
    await flush()
    expect(host.textContent).not.toContain('End frame')
    choose(stillPickers(host)[0]!, 'front')
    await flush()
    const generate = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Generate')!
    generate.click()
    await flush()
    expect(calls.find(call => call.url === '/api/agency/video/generation/jobs')?.body?.sourceAssetIds).toEqual(['source-front'])
  })
})
