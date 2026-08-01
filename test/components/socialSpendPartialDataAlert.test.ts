// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import SpendPartialDataAlert from '~~/app/components/social/SpendPartialDataAlert.vue'
import type { SpendSyncJobStatus } from '~~/app/types'

const stubs = {
  UAlert: {
    name: 'UAlert',
    props: ['title'],
    template: '<section role="alert"><h3>{{ title }}</h3><slot name="description" /></section>'
  },
  UButton: {
    name: 'UButton',
    props: ['label'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\', $event)">{{ label }}<slot /></button>'
  },
  UIcon: { name: 'UIcon', template: '<i />' }
}

const partialJob: SpendSyncJobStatus = {
  jobId: 'job-1',
  platform: 'google',
  period: '2026-08',
  status: 'completed',
  syncedCount: 30,
  totalSpend: 231.73,
  failures: [
    { account: 'Zulu Motors', reason: 'Access denied (403)' },
    { account: 'Alpha Motors', reason: 'Access denied (403)' }
  ],
  error: null,
  startedAt: '2026-08-01T03:19:22.000Z',
  finishedAt: '2026-08-01T03:21:24.000Z',
  totalAccounts: 108,
  processedAccounts: 108
}

function mountAlert(job: SpendSyncJobStatus) {
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(SpendPartialDataAlert, { platformName: 'Google Ads', job })
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  app.mount(host)
  return { app, host }
}

describe('SpendPartialDataAlert', () => {
  it('renders a persistent warning and expands grouped affected accounts', async () => {
    const { app, host } = mountAlert(partialJob)

    expect(host.textContent).toContain('Partial Google Ads data')
    expect(host.textContent).toContain('106 of 108 accounts synced')
    expect(host.textContent).not.toContain('Alpha Motors')

    const button = host.querySelector('button') as HTMLButtonElement
    expect(button.getAttribute('aria-expanded')).toBe('false')
    button.click()
    await nextTick()

    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(host.textContent).toContain('Access denied (403)')
    expect(host.textContent).toContain('Alpha Motors')
    expect(host.textContent).toContain('Zulu Motors')
    app.unmount()
  })

  it('renders no alert for a clean completed job', () => {
    const { app, host } = mountAlert({ ...partialJob, failures: [] })

    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(host.textContent).toBe('')
    app.unmount()
  })
})
