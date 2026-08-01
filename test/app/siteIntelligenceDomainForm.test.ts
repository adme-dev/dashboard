// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

import DomainModal from '~~/app/components/analytics/audiences/intelligence/DomainModal.vue'

const CLIENT_A = '11111111-1111-4111-8111-111111111111'

const stubs = {
  UModal: {
    props: ['open'],
    emits: ['update:open'],
    template: '<section v-if="open"><slot name="content" /></section>'
  },
  UFormField: {
    props: ['label', 'description', 'required'],
    template: '<label><span>{{ label }}</span><small>{{ description }}</small><slot /></label>'
  },
  UInput: {
    inheritAttrs: false,
    props: ['modelValue', 'type', 'disabled'],
    emits: ['update:modelValue'],
    template: '<input v-bind="$attrs" :type="type || \'text\'" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">'
  },
  UTextarea: {
    inheritAttrs: false,
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  USelectMenu: {
    inheritAttrs: false,
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: `<select v-bind="$attrs" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
      <option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option>
    </select>`
  },
  UCheckbox: {
    inheritAttrs: false,
    props: ['modelValue', 'label'],
    emits: ['update:modelValue'],
    template: '<label><input v-bind="$attrs" type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)">{{ label }}</label>'
  },
  UAccordion: {
    template: '<section><slot name="advanced" /></section>'
  },
  UAlert: {
    props: ['title', 'description'],
    template: '<aside>{{ title }} {{ description }}</aside>'
  },
  UButton: {
    inheritAttrs: false,
    props: ['label', 'disabled', 'loading', 'type'],
    emits: ['click'],
    template: '<button v-bind="$attrs" :type="type || \'button\'" :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot /></button>'
  }
}

function mountModal(onSaved = vi.fn()) {
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(DomainModal, {
      open: true,
      clients: [{ id: CLIENT_A, name: 'Alpha Motors' }],
      onSaved
    })
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return { app, host, onSaved }
}

function select(host: HTMLElement, testId: string, value: string) {
  const element = host.querySelector<HTMLSelectElement>(`[data-testid="${testId}"]`)!
  element.value = value
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function input(host: HTMLElement, testId: string, value: string) {
  const element = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-testid="${testId}"]`)!
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('site intelligence domain form', () => {
  it('resets to conservative public-competitor defaults when the lane changes', async () => {
    const { app, host } = mountModal()
    try {
      select(host, 'site-domain-lane', 'competitor')
      await nextTick()

      expect((host.querySelector('[data-testid="site-domain-page-limit"]') as HTMLInputElement).value).toBe('100')
      expect((host.querySelector('[data-testid="site-domain-depth"]') as HTMLInputElement).value).toBe('2')
      expect((host.querySelector('[data-testid="site-domain-retention"]') as HTMLInputElement).value).toBe('30')
      expect(host.textContent).toContain('Public pages only')
      expect((host.querySelector('[data-testid="site-domain-ai-input"]') as HTMLInputElement).checked).toBe(false)
    } finally {
      app.unmount()
    }
  })

  it('submits a governed competitor record through the agency API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ domain: { id: 'domain-id' } })
    vi.stubGlobal('$fetch', fetchMock)
    const { app, host, onSaved } = mountModal()

    try {
      select(host, 'site-domain-client', CLIENT_A)
      select(host, 'site-domain-lane', 'competitor')
      input(host, 'site-domain-name', 'Bravo GWM')
      input(host, 'site-domain-origin', 'https://bravo.example.com/offers')
      input(host, 'site-domain-justification', 'Monitor approved public automotive offers.')
      await nextTick()

      host.querySelector<HTMLButtonElement>('[data-testid="site-domain-save"]')!.click()
      await Promise.resolve()
      await nextTick()

      expect(fetchMock).toHaveBeenCalledWith('/api/agency/site-intelligence/domains', {
        method: 'POST',
        body: expect.objectContaining({
          clientId: CLIENT_A,
          lane: 'competitor',
          pageLimit: 100,
          depth: 2,
          crawlPurposes: ['search'],
          aiInputAllowed: false,
          retentionDays: 30
        })
      })
      expect(onSaved).toHaveBeenCalledWith({ id: 'domain-id' })
    } finally {
      app.unmount()
    }
  })

  it('uses Nuxt UI form controls and no browser-native production controls', () => {
    const source = readFileSync(
      'app/components/analytics/audiences/intelligence/DomainModal.vue',
      'utf8'
    )

    for (const component of ['UModal', 'UFormField', 'UInput', 'UTextarea', 'USelectMenu', 'UCheckbox', 'UButton']) {
      expect(source).toContain(`<${component}`)
    }
    expect(source).not.toMatch(/<input\b|<select\b|<textarea\b|<button\b|confirm\(|alert\(|prompt\(/i)
    expect(source).toContain('@container')
    expect(source).toContain('@lg:grid-cols-2')
  })

  it('does not expose empty select values', () => {
    const { app, host } = mountModal()
    try {
      const options = [...host.querySelectorAll<HTMLOptionElement>('option')]
      expect(options.length).toBeGreaterThan(0)
      expect(options.every(option => option.value.length > 0)).toBe(true)
    } finally {
      app.unmount()
    }
  })
})
