import { describe, expect, it } from 'vitest'
import { renderSearchAuthorityPublication } from '~~/server/utils/searchAuthority/publicationRenderer'

const input = {
  hostname: 'learn.knoxgwmhaval.com.au',
  slug: 'cannon-alpha-towing-guide',
  title: 'Cannon Alpha towing guide',
  excerpt: 'Source-backed guidance for Cannon Alpha towing questions.',
  bodyMarkdown: '## What should I confirm?\n\nConfirm the exact vehicle and accessory setup with the dealership.\n\n<script>alert(1)</script>',
  disclaimer: 'Specifications and eligibility can change. Confirm current details with Knox GWM.',
  schemaType: 'Article' as const,
  versionId: '11111111-1111-4111-8111-111111111111',
  publishedAt: '2026-08-03T02:00:00.000Z',
  sourceLabels: [{ name: 'Knox Sales Manager', role: 'Sales Manager' }],
  claims: [{
    claim: 'Vehicle and accessory configuration affects towing guidance.',
    sourceType: 'sales_interview',
    sourceReference: 'Sales Manager interview 2026-08-03'
  }],
  brandName: 'Knox GWM Haval',
  dealershipUrl: 'https://www.knoxgwmhaval.com.au/',
  publicationId: '33333333-3333-4333-8333-333333333333',
  tracking: { origin: 'https://app.xeroflow.io', writeKey: 'xf_public_example' }
}

describe('Search Authority publication renderer', () => {
  it('renders escaped, SSR-visible copy with canonical metadata and supported Article JSON-LD', () => {
    const rendered = renderSearchAuthorityPublication(input)

    expect(rendered.canonicalUrl).toBe('https://learn.knoxgwmhaval.com.au/guides/cannon-alpha-towing-guide')
    expect(rendered.contentType).toBe('text/html; charset=utf-8')
    expect(rendered.etag).toMatch(/^[a-f0-9]{64}$/)
    expect(rendered.html).toContain('<link rel="canonical" href="https://learn.knoxgwmhaval.com.au/guides/cannon-alpha-towing-guide">')
    expect(rendered.html).toContain('<meta property="og:title" content="Cannon Alpha towing guide">')
    expect(rendered.html).toContain('"@type":"Article"')
    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(rendered.html).not.toContain('<script>alert(1)</script>')
    expect(rendered.html).toContain(input.disclaimer)
    expect(rendered.html).toContain('src="https://app.xeroflow.io/track.js"')
    expect(rendered.html).toContain('data-key="xf_public_example"')
    expect(rendered.html).toContain('utm_content=publication_33333333-3333-4333-8333-333333333333')
  })

  it('emits FAQ schema only when matching questions and answers are visible', () => {
    const supported = renderSearchAuthorityPublication({
      ...input,
      schemaType: 'FAQPage',
      bodyMarkdown: '## How much can it tow?\n\nCapacity depends on variant and configuration.\n\n## What should I bring?\n\nBring your intended trailer details.'
    })
    const unsupported = renderSearchAuthorityPublication({
      ...input,
      schemaType: 'FAQPage',
      bodyMarkdown: 'A general paragraph without visible questions and answers.'
    })

    expect(supported.html).toContain('"@type":"FAQPage"')
    expect(supported.html).toContain('How much can it tow?')
    expect(unsupported.html).toContain('"@type":"Article"')
    expect(unsupported.html).not.toContain('"@type":"FAQPage"')
  })

  it('brands the page from the client name instead of a hardcoded dealership', () => {
    const rendered = renderSearchAuthorityPublication({ ...input, brandName: 'ADME Advertising' })
    expect(rendered.html).toContain(`<title>${input.title} | ADME Advertising</title>`)
    expect(rendered.html).toContain('Confirm current details with ADME Advertising')
    expect(rendered.html).toMatch(/"publisher":\s*\{\s*"@type":\s*"Organization",\s*"name":\s*"ADME Advertising"/)
    expect(rendered.html).not.toContain('Knox GWM Haval</a>')
    expect(() => renderSearchAuthorityPublication({ ...input, brandName: '  ' })).toThrow('brand name')
  })
})
