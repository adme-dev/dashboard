import { describe, expect, it } from 'vitest'

import { evaluateSearchAuthorityTrust } from '~~/server/utils/searchAuthority/trustChecks'

describe('search authority deterministic trust checks', () => {
  it('detects crawl, canonical, robots, soft-404, schema parity, and image hygiene failures', () => {
    const findings = evaluateSearchAuthorityTrust({
      sourceUrl: 'https://dealer.example.com/vehicles/h6-123',
      canonicalUrl: 'https://dealer.example.com/vehicles/h6-123',
      status: 'completed',
      httpStatus: 200,
      title: 'Vehicle not found',
      metadata: { sitemapUrls: [] },
      markdown: '# Vehicle no longer available\n\n![ ](https://cdn.example.com/IMG_1234.JPG)\n\nNow $42,990 drive away.',
      html: `
        <html><head>
          <meta name="robots" content="noindex,nofollow">
          <link rel="canonical" href="https://other.example.com/missing">
          <script type="application/ld+json">{
            "@context":"https://schema.org","@type":"Vehicle","vehicleIdentificationNumber":"VIN123",
            "offers":{"@type":"Offer","price":"44990","availability":"https://schema.org/InStock"}
          }</script>
        </head></html>
      `
    })

    expect(findings.map(finding => finding.checkKey)).toEqual(expect.arrayContaining([
      'indexability.robots_noindex',
      'canonical.cross_origin',
      'sitemap.not_discovered',
      'soft_404.detected',
      'schema.visible_price_mismatch',
      'image.missing_alt',
      'image.generic_filename'
    ]))
    expect(findings.every(finding => JSON.stringify(finding.evidence).length < 4096)).toBe(true)
  })

  it('does not invent failures when optional evidence is unavailable', () => {
    const findings = evaluateSearchAuthorityTrust({
      sourceUrl: 'https://dealer.example.com/vehicles/h6-123',
      canonicalUrl: 'https://dealer.example.com/vehicles/h6-123',
      status: 'completed',
      httpStatus: 200,
      title: '2026 Haval H6 Ultra Hybrid',
      metadata: {},
      markdown: '# 2026 Haval H6 Ultra Hybrid\n\n![Haval H6 front view](https://cdn.example.com/haval-h6-front-view.webp)\n\n$44,990 drive away.',
      html: ''
    })

    expect(findings).toEqual([])
  })

  it('treats invalid JSON-LD and bad HTTP status as deterministic findings', () => {
    const findings = evaluateSearchAuthorityTrust({
      sourceUrl: 'https://dealer.example.com/vehicles/cannon',
      canonicalUrl: 'https://dealer.example.com/vehicles/cannon',
      status: 'completed',
      httpStatus: 503,
      title: 'Cannon Alpha',
      markdown: '# Cannon Alpha',
      html: '<script type="application/ld+json">{invalid}</script>'
    })

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkKey: 'crawl.http_status', severity: 'critical', owner: 'dealer_origin' }),
      expect.objectContaining({ checkKey: 'schema.invalid_json_ld', severity: 'high', owner: 'dealer_origin' })
    ]))
  })
})
