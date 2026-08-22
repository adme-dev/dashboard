// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import SpendPeriodPicker from '~~/app/components/social/SpendPeriodPicker.vue'

const stubs = {
  UButton: { props: ['label'], template: '<button type="button">{{ label }}<slot /><slot name="trailing" /></button>' },
  UPopover: { template: '<div><slot /><slot name="content" /></div>' },
  UCalendar: { template: '<div data-calendar />' },
  UIcon: { template: '<i />' },
  UTooltip: { template: '<span><slot /></span>' },
}

function mount(showSync?: boolean) {
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(SpendPeriodPicker, {
      month: 8,
      year: 2026,
      weekFilter: null,
      showSync,
    }),
  })
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
  app.mount(host)
  return { app, host }
}

describe('Spend period picker', () => {
  it('hides only sync freshness controls when requested', () => {
    const { app, host } = mount(false)
    try {
      expect(host.textContent).toContain('August 2026')
      expect(host.textContent).toContain('All')
      expect(host.textContent).not.toContain('Sync now')
      expect(host.textContent).not.toContain('Never synced')
    } finally {
      app.unmount()
    }
  })

  it('retains sync freshness controls by default for social spend callers', () => {
    const { app, host } = mount()
    try {
      expect(host.textContent).toContain('Sync now')
      expect(host.textContent).toContain('Never synced')
    } finally {
      app.unmount()
    }
  })
})
