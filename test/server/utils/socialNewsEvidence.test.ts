import { describe, expect, it } from 'vitest'
import { projectSocialNewsEvidence } from '../../../server/utils/socialNewsEvidence'

describe('projectSocialNewsEvidence', () => {
  it('promotes rich ADME evidence while retaining provenance', () => {
    const evidence = projectSocialNewsEvidence({
      id: 'row-1',
      external_id: 'external-1',
      source_url: 'https://adme.example/stories/ev-launch',
      title: 'EV launch',
      summary: 'Market summary',
      author: 'Automotive Newsroom',
      published_at: '2026-07-24T01:00:00.000Z',
      created_at: '2026-07-24T02:00:00.000Z',
      raw: {
        slug: 'ev-launch',
        original_source_url: 'https://publisher.example/ev-launch',
        source_type: 'oem',
        topics: ['EV', 'Launch', 'EV'],
        make: 'Example Motors',
        model: 'E1',
        entities: ['Example Motors', { name: 'E1' }],
        geography: ['Australia'],
        regions: [{ name: 'Victoria' }],
        image: 'https://images.example/ev-launch.jpg',
        image_credit: 'Example Motors',
        outlets: ['Outlet A', { name: 'Outlet B' }],
        coverage_count: 3,
        summary: {
          bullets: ['First point', 'Second point'],
          dealerNote: 'Validate local stock before activation.',
          angle: 'Test EV education content against qualified lead outcomes.',
        },
      },
    })

    expect(evidence).toMatchObject({
      evidenceId: 'row-1',
      provider: 'adme',
      providerRecordId: 'ev-launch',
      originalSourceUrl: 'https://publisher.example/ev-launch',
      sourceType: 'oem',
      topics: ['EV', 'Launch'],
      make: 'Example Motors',
      model: 'E1',
      entities: ['Example Motors', 'E1'],
      geography: ['Australia', 'Victoria'],
      imageCredit: 'Example Motors',
      coverageCount: 3,
      outlets: ['Outlet A', 'Outlet B'],
      isAiDerivative: true,
      attributionRequired: true,
      connectorVersion: 'mcp-news-v1',
      evidenceSchemaVersion: 1,
      projectionWarnings: [],
    })
    expect(evidence.rawChecksum).toMatch(/^fnv1a32:[0-9a-f]{8}$/)
    expect(evidence.observedFields).toContain('summary')
  })

  it('returns warnings rather than throwing for malformed provider fields', () => {
    const evidence = projectSocialNewsEvidence({
      id: 'row-2',
      title: '',
      raw: {
        topics: 'not-an-array',
        outlets: { name: 'not-an-array' },
      },
    })

    expect(evidence.topics).toEqual([])
    expect(evidence.outlets).toEqual([])
    expect(evidence.projectionWarnings).toEqual(expect.arrayContaining([
      'missing_story_url',
      'missing_title',
      'invalid_topics_shape',
      'invalid_outlets_shape',
    ]))
  })

  it('produces the same fallback checksum for equivalent object key order', () => {
    const first = projectSocialNewsEvidence({ raw: { title: 'A', topics: ['EV'] } })
    const second = projectSocialNewsEvidence({ raw: { topics: ['EV'], title: 'A' } })

    expect(first.rawChecksum).toBe(second.rawChecksum)
  })
})
