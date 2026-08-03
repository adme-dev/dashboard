import { describe, expect, it } from 'vitest'
import {
  publicationAttributionMarker,
  summarizeSearchAuthorityMeasurement
} from '~~/server/utils/searchAuthority/measurement'

const publication = {
  id: '33333333-3333-4333-8333-333333333333',
  publicUrl: 'https://learn.knoxgwmhaval.com.au/guides/cannon-alpha-towing-guide',
  title: 'Cannon Alpha towing guide',
  publishedAt: '2026-08-01T00:00:00.000Z'
}

describe('Search Authority outcome measurement', () => {
  it('deduplicates measured views and CTA handoffs inside the inclusive UTC window', () => {
    const marker = publicationAttributionMarker(publication.id)
    const summary = summarizeSearchAuthorityMeasurement({
      startDate: '2026-08-01',
      endDate: '2026-08-02',
      publications: [publication],
      events: [
        { eventId: 'view-1', eventName: 'page_view', pageUrl: `${publication.publicUrl}?utm_source=google`, occurredAt: '2026-08-01T00:00:00.000Z', eventData: {} },
        { eventId: 'view-1', eventName: 'page_view', pageUrl: publication.publicUrl, occurredAt: '2026-08-01T00:00:01.000Z', eventData: {} },
        { eventId: 'click-1', eventName: 'click', pageUrl: publication.publicUrl, occurredAt: '2026-08-02T23:59:59.999Z', eventData: { href: `https://www.knoxgwmhaval.com.au/?utm_content=${marker}` } },
        { eventId: 'late', eventName: 'page_view', pageUrl: publication.publicUrl, occurredAt: '2026-08-03T00:00:00.000Z', eventData: {} }
      ],
      leads: [],
      ga4LandingPages: []
    })

    expect(summary.publications[0]).toMatchObject({ measuredViews: 1, measuredCtaHandoffs: 1 })
  })

  it('labels direct, assisted and unknown lead linkage without inventing identity', () => {
    const marker = publicationAttributionMarker(publication.id)
    const summary = summarizeSearchAuthorityMeasurement({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      publications: [publication],
      events: [],
      leads: [
        { id: 'direct', submittedAt: '2026-08-02T00:00:00.000Z', attribution: { utm_content: marker } },
        { id: 'assisted', submittedAt: '2026-08-03T00:00:00.000Z', attribution: { first_utm_content: marker, last_utm_content: 'pmax' } },
        { id: 'unknown', submittedAt: '2026-08-04T00:00:00.000Z', attribution: {} }
      ],
      ga4LandingPages: []
    })

    expect(summary.publications[0]).toMatchObject({ directLeads: 1, assistedLeads: 1 })
    expect(summary.unlinkedLeads).toBe(1)
    expect(summary.limitations.join(' ')).toContain('Unlinked leads remain unknown')
  })

  it('keeps GA4 unavailable when no landing-page evidence exists instead of backfilling zero', () => {
    const summary = summarizeSearchAuthorityMeasurement({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      publications: [publication],
      events: [],
      leads: [],
      ga4LandingPages: []
    })

    expect(summary.ga4).toEqual({ available: false, sessions: null, dataThroughDate: null })
  })

  it('labels first-party events unavailable when the immutable publication had no tracking binding', () => {
    const summary = summarizeSearchAuthorityMeasurement({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      publications: [{ ...publication, measurementAvailable: false }],
      events: [],
      leads: [],
      ga4LandingPages: []
    })

    expect(summary.firstParty.available).toBe(false)
    expect(summary.limitations.join(' ')).toContain('First-party guide event measurement is unavailable')
  })

  it('attributes a shared canonical page view only to the version active at event time', () => {
    const newer = {
      ...publication,
      id: '44444444-4444-4444-8444-444444444444',
      publishedAt: '2026-08-02T00:00:00.000Z'
    }
    const summary = summarizeSearchAuthorityMeasurement({
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      publications: [newer, publication],
      events: [
        { eventId: 'old-view', eventName: 'page_view', pageUrl: publication.publicUrl, occurredAt: '2026-08-01T12:00:00.000Z', eventData: {} },
        { eventId: 'new-view', eventName: 'page_view', pageUrl: publication.publicUrl, occurredAt: '2026-08-02T12:00:00.000Z', eventData: {} }
      ],
      leads: [],
      ga4LandingPages: []
    })

    expect(summary.publications.find(row => row.id === publication.id)?.measuredViews).toBe(1)
    expect(summary.publications.find(row => row.id === newer.id)?.measuredViews).toBe(1)
    expect(summary.totals.measuredViews).toBe(2)
  })
})
