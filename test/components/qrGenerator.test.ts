// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import QrGenerator from '~~/app/components/tools/QrGenerator.client.vue'

const stubs = {
  UFormField: { name: 'UFormField', props: ['label'], template: '<label><span>{{ label }}</span><slot /></label>' },
  UTextarea: { name: 'UTextarea', props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UInput: { name: 'UInput', props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  USelect: { name: 'USelect', props: ['modelValue', 'items'], template: '<select />' },
  UButton: { name: 'UButton', props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\', $event)">{{ label }}</button>' },
  UAlert: { name: 'UAlert', props: ['title'], template: '<div role="alert">{{ title }}</div>' },
  UIcon: { name: 'UIcon', props: ['name'], template: '<i />' },
}
;(globalThis as any).useToast = () => ({ add: vi.fn() })

async function mount(props: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(QrGenerator, props) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  app.mount(host)
  await nextTick()
  return { app, host }
}

describe('QrGenerator', () => {
  it('renders an SVG QR locally for typed content, and empties when cleared', async () => {
    const { app, host } = await mount()
    try {
      const input = host.querySelector('textarea') as HTMLTextAreaElement
      input.value = 'https://app.xeroflow.io/portal'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick(); await new Promise(r => setTimeout(r, 20)); await nextTick()
      expect(host.querySelector('[data-testid="qr-preview"] svg')).toBeTruthy()
      const buttons = [...host.querySelectorAll('button')]
      expect(buttons.find(b => b.textContent === 'PNG')?.disabled).toBe(false)

      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick(); await new Promise(r => setTimeout(r, 20)); await nextTick()
      expect(host.querySelector('[data-testid="qr-preview"] svg')).toBeNull()
      expect(host.textContent).toContain('Type content to generate')
    } finally {
      app.unmount()
    }
  })

  it('offers preset links that fill the content field', async () => {
    const { app, host } = await mount({ presets: [{ label: 'Client portal', value: 'https://app.xeroflow.io/portal' }] })
    try {
      ;([...host.querySelectorAll('button')].find(b => b.textContent === 'Client portal') as HTMLButtonElement).click()
      await nextTick(); await new Promise(r => setTimeout(r, 20)); await nextTick()
      expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('https://app.xeroflow.io/portal')
      expect(host.querySelector('[data-testid="qr-preview"] svg')).toBeTruthy()
    } finally {
      app.unmount()
    }
  })
})
