// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { computed, createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import SpendAiMaxSummary from '~~/app/components/social/SpendAiMaxSummary.vue'
import SpendAiMaxTable from '~~/app/components/social/SpendAiMaxTable.vue'
import SpendAiMaxDetailSlideover from '~~/app/components/social/SpendAiMaxDetailSlideover.vue'

Object.assign(globalThis, { computed })

const stubs: Record<string, unknown> = {
  UButton: { props: ['to', 'icon'], template: '<a :href="to"><slot /></a>' },
  UBadge: { props: ['color'], template: '<span data-badge><slot /></span>' },
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' },
  UProgress: { props: ['modelValue'], template: '<div :data-progress="modelValue" />' },
  UAlert: { props: ['title', 'description'], template: '<div>{{ title }} {{ description }}</div>' },
  UFormField: { props: ['label'], template: '<label :data-field="label">{{ label }}<slot /></label>' },
  UInput: { props: ['modelValue', 'placeholder'], template: '<input :placeholder="placeholder" />' },
  USelect: { props: ['modelValue', 'items'], template: '<select />' },
  UTable: { props: ['data', 'columns'], template: '<div data-table :data-count="data.length" />' },
  UPagination: { props: ['page', 'total', 'itemsPerPage'], template: '<nav data-pagination />' },
  USlideover: { props: ['open'], template: '<aside v-if="open"><slot name="content" /></aside>' },
}

async function render(component: any, props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(component, props) })
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
  return renderToString(app)
}

const item = {
  id: 'state-1',
  connectionId: 'connection-1',
  customerId: '123',
  accountName: 'Google AU',
  client: { id: 'client-1', name: 'Acme Automotive' },
  owner: { id: 'owner-1', name: 'Alex' },
  campaignId: '456',
  campaignName: 'Generic Search',
  campaignStatus: 'ENABLED',
  deepLink: 'https://ads.google.com/aw/campaigns',
  readinessStatus: 'needs_review',
  migrationReason: 'aca',
  aiMaxEnabled: true,
  effectiveSettings: {
    searchTermMatching: 'partially_disabled',
    textCustomisation: 'enabled',
    finalUrlExpansion: 'disabled',
  },
  risks: ['PARTIAL_SEARCH_MATCHING'],
  freshness: 'fresh',
  lastObservedAt: '2026-08-06T00:00:00.000Z',
  lastChangedAt: '2026-08-06T00:00:00.000Z',
}

describe('SpendAiMaxSummary', () => {
  it('renders the migration cutoff, coverage and decision counts as one ledger', async () => {
    const html = await render(SpendAiMaxSummary, {
      summary: {
        eligible: 20,
        affected: 8,
        enabled: 3,
        needsReview: 2,
        unknown: 1,
        changed: 4,
        lastCompletedScanAt: '2026-08-06T00:00:00.000Z',
        coveragePercent: 75,
      },
      latestRun: null,
    })

    expect(html).toContain('1 September 2026')
    expect(html).toContain('20')
    expect(html).toContain('Needs review')
    expect(html).toContain('75% coverage')
  })
})

describe('SpendAiMaxTable', () => {
  it('renders labeled Nuxt UI filters and the server-paginated table', async () => {
    const html = await render(SpendAiMaxTable, {
      items: [item],
      loading: false,
      page: 1,
      pageSize: 25,
      total: 1,
      filters: {
        search: '',
        status: 'all',
        migrationReason: 'all',
        stale: 'all',
        campaignStatus: 'all',
        connectionId: 'all',
        clientId: 'all',
      },
      connectionOptions: [{ label: 'All accounts', value: 'all' }],
      clientOptions: [{ label: 'All clients', value: 'all' }],
    })

    for (const label of ['Search', 'Readiness', 'Migration trigger', 'Freshness', 'Google account', 'Client']) {
      expect(html).toContain(`data-field="${label}"`)
    }
    expect(html).toContain('data-table')
    expect(html).toContain('1 campaign')
  })

  it('gives a directional empty state instead of a blank table', async () => {
    const html = await render(SpendAiMaxTable, {
      items: [],
      loading: false,
      page: 1,
      pageSize: 25,
      total: 0,
      filters: { search: '', status: 'all', migrationReason: 'all', stale: 'all', campaignStatus: 'all', connectionId: 'all', clientId: 'all' },
      connectionOptions: [],
      clientOptions: [],
    })

    expect(html).toContain('No campaigns match this review')
    expect(html).toContain('Clear filters')
  })
})

describe('SpendAiMaxDetailSlideover', () => {
  it('renders raw evidence, controls and the material timeline without edit actions', async () => {
    const html = await render(SpendAiMaxDetailSlideover, {
      open: true,
      loading: false,
      detail: {
        ...item,
        advertisingChannelType: 'SEARCH',
        biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
        keywordMatchType: 'BROAD',
        bundlingRequired: 'NOT_REQUIRED',
        textAssetAutomationStatus: 'OPTED_IN',
        finalUrlExpansionStatus: 'OPTED_OUT',
        adGroups: { total: 3, searchTermMatchingDisabled: 1 },
        rawEvidence: { keywordMatchType: 'BROAD' },
        firstObservedAt: '2026-08-05T00:00:00.000Z',
        timeline: [{
          id: 'event-1',
          eventType: 'setting_changed',
          previousValue: { aiMaxEnabled: false },
          currentValue: { aiMaxEnabled: true },
          observedAt: '2026-08-06T00:00:00.000Z',
        }],
      },
    })

    expect(html).toContain('Current Google evidence')
    expect(html).toContain('Material change history')
    expect(html).toContain('MAXIMIZE_CONVERSIONS')
    expect(html).not.toContain('Save changes')
  })
})
