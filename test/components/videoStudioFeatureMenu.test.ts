// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import VideoStudioFeatureMenu from '~~/app/components/media/VideoStudioFeatureMenu.vue'
import { selectableVideoModelOptions } from '~~/app/utils/video/modelPresentation'
import { listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'

async function mount(enabled: boolean) {
  const events: string[] = []
  const models = selectableVideoModelOptions(listSelectableVideoGenerationModels())
  const host = document.createElement('div')
  const app = createApp({ render: () => h(VideoStudioFeatureMenu, {
    models, 'generationEnabled': enabled,
    'onSelect-model': (id: string) => events.push(id)
  }) })
  app.component('UPopover', { template: '<div><slot /><slot name="content" :close="() => {}" /></div>' })
  app.component('UButton', { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>' })
  app.component('UIcon', { template: '<i />' })
  app.component('UBadge', { props: ['label'], template: '<span>{{ label }}</span>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<p>{{ title }} {{ description }}</p>' })
  app.component('USkeleton', { template: '<span />' })
  app.mount(host)
  await nextTick()
  return { host, app, events, models }
}

describe('studio feature discovery', () => {
  it('only selects a listed model when explicitly clicked', async () => {
    const { host, app, events, models } = await mount(true)
    try {
      expect(events).toEqual([])
      const model = models[0]!
      const button = [...host.querySelectorAll('button')].find(item => item.textContent?.includes(model.label))!
      expect(button).toBeTruthy()
      button.click()
      await nextTick()
      expect(events).toEqual([model.id])
      expect(host.textContent).toContain('checked before submission')
    } finally {
      app.unmount()
    }
  })
  it('shows setup status without selectable model buttons when policy is disabled', async () => {
    const { host, app, events, models } = await mount(false)
    try {
      expect(host.textContent).toContain('Generation needs setup')
      expect([...host.querySelectorAll('button')].some(item => item.textContent?.includes(models[0]!.label))).toBe(false)
      expect(events).toEqual([])
    } finally {
      app.unmount()
    }
  })
})
