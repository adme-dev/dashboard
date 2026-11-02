// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import CampaignPreflightPanel from '~~/app/components/email/CampaignPreflightPanel.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span><slot />{{ label }}</span>' },
  USkeleton: { name: 'USkeleton', template: '<div class="skeleton" />' },
  UButton: { name: 'UButton', props: ['label'], template: '<button type="button">{{ label }}</button>' }
}

async function renderPanel(props: Record<string, unknown>) {
  const app = createSSRApp({
    render: () => h(CampaignPreflightPanel, props)
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

describe('CampaignPreflightPanel', () => {
  it('renders blocked and warning preflight checks', async () => {
    const html = await renderPanel({
      preflight: {
        ok: false,
        blocked: true,
        checkedAt: '2026-06-05T00:00:00.000Z',
        checks: [
          { code: 'sender', label: 'Sender', status: 'blocked', message: 'Missing sender email' },
          { code: 'media_urls', label: 'Media URLs', status: 'warning', message: 'One image uses HTTP' }
        ]
      },
      recipientSnapshot: {
        listIds: ['list-1', 'list-2'],
        dedupedRecipients: 42,
        excludedUnsubscribed: 5,
        excludedSuppressed: 3,
        excludedBlocklisted: 2,
        excludedDisabled: 1,
        toSend: 32,
        generatedAt: '2026-06-05T00:00:00.000Z'
      }
    })

    expect(html).toContain('Preflight')
    expect(html).toContain('Blocked')
    expect(html).toContain('Sender')
    expect(html).toContain('Missing sender email')
    expect(html).toContain('Media URLs')
    expect(html).toContain('One image uses HTTP')
    expect(html).toContain('Ready to send')
    expect(html).toContain('32')
    expect(html).toContain('Selected lists')
    expect(html).toContain('2')
    expect(html).toContain('Deduped recipients')
    expect(html).toContain('42')
    expect(html).toContain('Unsubscribed')
    expect(html).toContain('Suppressed')
    expect(html).toContain('Blocklisted')
    expect(html).toContain('Disabled')
  })

  it('renders a not-run state before schedule preflight has been checked', async () => {
    const html = await renderPanel({
      preflight: null,
      recipientSnapshot: {
        listIds: ['list-1'],
        toSend: 12,
        generatedAt: '2026-06-05T00:00:00.000Z'
      }
    })

    expect(html).toContain('Not run')
    expect(html).toContain('Preflight runs when this campaign is scheduled.')
    expect(html).toContain('Ready to send')
    expect(html).toContain('12')
  })

  it('falls back to readable labels for stored checks without labels', async () => {
    const html = await renderPanel({
      preflight: {
        ok: false,
        blocked: true,
        checkedAt: '2026-06-05T00:00:00.000Z',
        checks: [
          {
            code: 'auth_readiness',
            status: 'blocked',
            message: 'Sending transport is not configured or the From domain is not allowed.'
          }
        ]
      },
      recipientSnapshot: { toSend: 10 }
    })

    expect(html).toContain('Authentication readiness')
    expect(html).toContain('From domain is not allowed')
  })

  it('separates blockers from advisory warnings and preserves unique entries with the same code', async () => {
    const html = await renderPanel({
      preflight: { ok: false, blocked: true, checks: [
        { code: 'image_alt', id: 'alt:a', status: 'warning', message: 'Image A needs a description', reference: { blockId: 'a' } },
        { code: 'image_alt', id: 'alt:b', status: 'warning', message: 'Image B needs a description', reference: { blockId: 'b' } },
        { code: 'sender', status: 'blocked', message: 'Choose a sender' }
      ] }, contentOnly: true, canSelectIssue: true
    })
    expect(html.indexOf('Resolve before sending')).toBeLessThan(html.indexOf('Review warnings'))
    expect(html).toContain('Image A needs a description')
    expect(html).toContain('Image B needs a description')
    expect(html).toContain('aria-label="Review image alt in editor"')
    expect(html).toContain('overflow-y-auto')
    expect(html).not.toContain('Selected lists')
    expect(html).toContain('do not certify email-client rendering')
  })

  it('emits the stable reference from a keyboard-accessible real button', async () => {
    const reference = { blockId: 'imported', regionId: 'image:table[0]/tbody[0]/tr[0]/td[0]/img[0]' }
    const received: unknown[] = []
    const app = createApp({ render: () => h(CampaignPreflightPanel, {
      preflight: { ok: true, blocked: false, checks: [{ code: 'image_alt', status: 'warning', message: 'Missing alt', reference }] },
      contentOnly: true, canSelectIssue: true,
      onSelectIssue: (value: unknown) => received.push(value)
    }) })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    const host = document.createElement('div')
    document.body.append(host)
    try {
      app.mount(host)
      host.querySelector('button')!.click()
      await nextTick()
      expect(received).toEqual([reference])
    } finally {
      app.unmount()
      host.remove()
    }
  })
})
