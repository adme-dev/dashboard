// @vitest-environment happy-dom
import { createApp, h, nextTick, reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import LayoutSettings from '../../app/components/email/builder/EmailLayoutSettings.vue'
import type { EdmEmailLayoutSettings } from '../../app/types/edm'

describe('generated email layout controls', () => {
  it('enables the palette explicitly and emits bounded width and palette updates', async () => {
    const settings = reactive<EdmEmailLayoutSettings>({ backdropColor: '#ffffff', canvasColor: '#ffffff', textColor: '#111111', fontFamily: 'MODERN_SANS' })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({ render: () => h(LayoutSettings, { settings, onUpdate: patch => Object.assign(settings, patch) }) })
    app.component('UFormField', { props: ['label'], template: '<section :data-label="label"><slot /></section>' })
    app.component('UCheckbox', { props: ['modelValue', 'label'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{label}}</label>' })
    app.component('UInput', { props: ['modelValue', 'type', 'min', 'max'], emits: ['update:modelValue'], template: '<input :type="type" :value="modelValue" :min="min" :max="max" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
    app.component('USelect', { template: '<select />' })
    app.mount(host)
    try {
      expect(host.querySelector('[data-label="Dark content background"]')).toBeNull()
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
      await nextTick()
      expect(settings.darkMode).toBe(true)
      const color = host.querySelector<HTMLInputElement>('[data-label="Dark content background"] input')!
      color.value = '#182430'
      color.dispatchEvent(new Event('input'))
      await nextTick()
      expect(settings.darkCanvasColor).toBe('#182430')
      const width = host.querySelector<HTMLInputElement>('[data-label="Email width"] input')!
      width.value = '960'
      width.dispatchEvent(new Event('input'))
      await nextTick()
      expect(settings.contentWidth).toBe(960)
      width.value = '100000'
      width.dispatchEvent(new Event('input'))
      await nextTick()
      expect(settings.contentWidth).toBe(960)
      width.dispatchEvent(new Event('blur'))
      await nextTick()
      expect(settings.contentWidth).toBe(600)
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
      await nextTick()
      expect(settings.darkMode).toBe(false)
      expect(settings.darkCanvasColor).toBe('#182430')
      expect(host.querySelector('[data-label="Dark content background"]')).toBeNull()
    } finally {
      app.unmount()
      host.remove()
    }
  })
})
