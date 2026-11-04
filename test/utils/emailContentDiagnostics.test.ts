// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { diagnoseEmailContent, EMAIL_DIAGNOSTIC_LIMITS } from '../../shared/emailRendering/contentDiagnostics'
import { getHtmlEditableSelection } from '../../app/utils/edmHtmlEditables'
import { buildCampaignPreflight } from '../../server/utils/email-marketing/campaignSend'

const metadata = { subject: 'Monthly news', previewText: 'Explore this month’s offers' }
const document = <T extends Record<string, unknown>>(children: T) => ({
  root: { type: 'EmailLayout', data: { childrenIds: Object.keys(children), props: { canvasColor: '#ffffff', textColor: '#222222' } } },
  ...children
})
const imported = (contents: string) => document({ imported: { type: 'Html', data: { props: { documentMode: 'email', contents } } } })
const codes = (issues: ReturnType<typeof diagnoseEmailContent>) => issues.map(issue => issue.code)

describe('email content diagnostics', () => {
  it('checks mobile image sources and block background images like other sent images', () => {
    const source = document({
      hero: { type: 'Image', data: { props: { url: 'https://cdn.example.com/desktop.png', alt: 'Hero' }, mobile: { props: { url: 'https://cdn.example.com/mobile.png' } } } },
      card: { type: 'Html', data: { style: { backgroundImage: 'https://cdn.example.com/sand.jpg' }, props: { contents: '<p>Card</p>' } } }
    })
    const issues = diagnoseEmailContent({ ...metadata, document: source, imageAssets: [{ url: 'https://cdn.example.com/mobile.png', fileSize: 700 * 1024 }, { url: 'https://cdn.example.com/sand.jpg', fileSize: 800 * 1024 }] })
    expect(issues.filter(issue => issue.code === 'heavy_image').map(issue => issue.reference)).toEqual([{ blockId: 'hero' }, { blockId: 'card' }])
    // The mobile source inherits the image description; a background is decorative.
    expect(codes(issues)).not.toContain('image_alt')
  })

  it('locates nested canonical blocks and uses stored image metadata without fetching', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not fetch'))
    const source = {
      root: { type: 'EmailLayout', data: { childrenIds: ['columns'], props: { canvasColor: '#ffffff' } } },
      columns: { type: 'ColumnsContainer', data: { props: { columns: [{ childrenIds: ['image', 'button', 'copy'] }] } } },
      image: { type: 'Image', data: { props: { url: 'https://cdn.example.com/hero.png' } } },
      button: { type: 'Button', data: { props: { text: 'View offer', url: '#' } } },
      copy: { type: 'Text', data: { style: { fontSize: 10, color: '#aaaaaa' }, props: { text: '<p>Offer details</p>' } } }
    }
    const before = JSON.stringify(source)
    const issues = diagnoseEmailContent({ ...metadata, document: source, imageAssets: [{ url: 'https://cdn.example.com/hero.png', fileSize: 600 * 1024 }] })
    expect(codes(issues)).toEqual(expect.arrayContaining(['image_alt', 'action_url', 'small_type', 'low_contrast', 'heavy_image', 'headings']))
    expect(issues.find(issue => issue.code === 'image_alt')?.reference).toEqual({ blockId: 'image' })
    expect(issues.find(issue => issue.code === 'action_url')?.reference).toEqual({ blockId: 'button' })
    expect(fetch).not.toHaveBeenCalled()
    expect(JSON.stringify(source)).toBe(before)
    fetch.mockRestore()
  })

  it('respects decorative alt text, optional image links and unknown asset weight', () => {
    const issues = diagnoseEmailContent({ ...metadata, document: document({
      heading: { type: 'Heading', data: { props: { level: 'h1', text: 'Offers' } } },
      decoration: { type: 'Image', data: { props: { url: 'https://cdn.example.com/rule.png', alt: '', linkHref: '' } } },
      image: { type: 'Image', data: { props: { url: 'https://cdn.example.com/car.png', alt: 'Car on road' } } },
      button: { type: 'Button', data: { props: { text: 'Call us', url: 'tel:+61390000000' } } }
    }) })
    expect(issues).toEqual([])
  })

  it('inspects complete HTML without rewriting head, CSS, conditionals or hidden variants', () => {
    const html = '<!doctype html><html lang="en-AU"><head><style>.mobile {display:none}</style></head><body><h1>Offers</h1><!--[if mso]><table></table><![endif]--><div style="display:none" class="mobile"><img></div><table><tr><td><a href="#"><img src="https://cdn.example.com/offer.png"></a><p style="color:#aaa;background-color:#fff;font-size:10px">Terms</p></td></tr></table></body></html>'
    const source = imported(html)
    const before = JSON.stringify(source)
    const issues = diagnoseEmailContent({ ...metadata, document: source })
    expect(codes(issues)).toEqual(['action_url', 'image_alt'])
    expect(JSON.stringify(source)).toBe(before)
    for (const issue of issues) {
      expect(issue.reference?.blockId).toBe('imported')
      const selection = getHtmlEditableSelection(html, issue.reference!.regionId!)
      expect(selection).not.toBeNull()
      expect(selection?.kind).toBe(issue.code === 'image_alt' ? 'image' : 'link')
    }
  })

  it('retains stable IDs and editor region paths across content-only changes', () => {
    const html = '<html lang="en"><body><h1>Title</h1><table><tr><td><img src="https://cdn.example.com/a.png"></td></tr></table></body></html>'
    const first = diagnoseEmailContent({ ...metadata, document: imported(html) }).find(issue => issue.code === 'image_alt')!
    const second = diagnoseEmailContent({ ...metadata, document: imported(html.replace('Title', 'A new title')) }).find(issue => issue.code === 'image_alt')!
    expect(first.id).toBe(second.id)
    expect(first.reference?.regionId).toBe('image:table[0]/tbody[0]/tr[0]/td[0]/img[0]')
    expect(getHtmlEditableSelection(html, first.reference!.regionId!)?.src).toBe('https://cdn.example.com/a.png')
  })

  it('checks absent metadata and excessive headings independently', () => {
    const issues = diagnoseEmailContent({ html: '<html><body><h1>First</h1><h1>Second</h1></body></html>', subject: '', previewText: '' })
    expect(codes(issues)).toEqual(expect.arrayContaining(['headings', 'language', 'subject', 'preheader']))
    expect(issues.find(issue => issue.code === 'headings')?.value).toBe(2)
    expect(issues.every(issue => issue.status === 'warning')).toBe(true)
    const absent = diagnoseEmailContent({ ...metadata, html: '<html lang="en"><body><p>Copy</p></body></html>' })
    expect(codes(absent)).toEqual(['headings'])
  })

  it('checks long and duplicate inbox metadata and honours an embedded preheader', () => {
    expect(codes(diagnoseEmailContent({ html: '<h1>Title</h1>', subject: 'x'.repeat(79), previewText: 'y'.repeat(151) }))).toEqual(expect.arrayContaining(['subject', 'preheader']))
    expect(codes(diagnoseEmailContent({ html: '<h1>Title</h1>', subject: 'Same', previewText: 'same' }))).toContain('preheader')
    expect(codes(diagnoseEmailContent({ html: '<h1>Title</h1><div class="preheader" style="display:none">Inbox snippet</div>', subject: 'News' }))).not.toContain('preheader')
  })

  it('checks inline solid colours and inherited typography but skips unknown compositing', () => {
    const html = '<html lang="en"><body style="background-color:#ffffff;color:rgb(170,170,170);font-size:10px"><h1 style="color:#000000;font-size:24px">Title</h1><p>Small copy</p><div style="background-image:url(https://cdn.example.com/a.png)"><p>Image background</p></div><p style="color:rgba(0,0,0,.5)">Alpha colour</p></body></html>'
    const issues = diagnoseEmailContent({ ...metadata, html })
    expect(issues.filter(issue => issue.code === 'low_contrast')).toHaveLength(1)
    expect(issues.find(issue => issue.code === 'low_contrast')?.value).toBe(2.32)
    expect(issues.filter(issue => issue.code === 'small_type')).toHaveLength(2)
    expect(codes(diagnoseEmailContent({ ...metadata, html: html.replace('<body', '<head><link rel="stylesheet" href="https://example.com/style.css"></head><body') }))).not.toContain('low_contrast')
    // The full-document compiler bypasses root canvasColor; it is not evidence
    // that an otherwise transparent imported email has a white background.
    expect(codes(diagnoseEmailContent({ ...metadata, document: imported('<html lang="en"><body><h1>Title</h1><p style="color:#aaa">Copy</p></body></html>') }))).not.toContain('low_contrast')
  })

  it('flags missing image sources and linked image destinations without requiring all images to link', () => {
    const issues = diagnoseEmailContent({ ...metadata, html: '<html lang="en"><body><h1>Title</h1><img alt=""><a><img src="https://cdn.example.com/a.png" alt="Car"></a><a href="{{ unsubscribe_url }}">Unsubscribe</a></body></html>' })
    expect(codes(issues)).toEqual(['image_url', 'action_url'])
  })

  it('does not execute active markup or infer the size of remote images', () => {
    const issues = diagnoseEmailContent({ ...metadata, html: '<html lang="en"><head><script>throw new Error("execute")</script></head><body><h1>Title</h1><img src="https://cdn.example.com/big.png" alt="Car" onerror="throw new Error()"></body></html>' })
    expect(issues).toEqual([])
  })

  it('bounds HTML bytes, parser nodes, depth, issue count and cyclic documents', () => {
    const tooBig = diagnoseEmailContent({ ...metadata, html: 'x'.repeat(EMAIL_DIAGNOSTIC_LIMITS.htmlBytes + 1) })
    expect(codes(tooBig)).toEqual(['inspection_limit'])
    const many = diagnoseEmailContent({ ...metadata, html: '<html lang="en"><body><h1>Title</h1>' + '<img>'.repeat(500) + '</body></html>' })
    expect(many.length).toBeLessThanOrEqual(EMAIL_DIAGNOSTIC_LIMITS.issues)
    expect(codes(many)).toContain('inspection_limit')
    const deep = diagnoseEmailContent({ ...metadata, html: '<div>'.repeat(105) + 'copy' + '</div>'.repeat(105) })
    expect(codes(deep)).toContain('inspection_limit')
    const nodes = diagnoseEmailContent({ ...metadata, html: '<br>'.repeat(EMAIL_DIAGNOSTIC_LIMITS.nodes + 1) })
    expect(codes(nodes)).toContain('inspection_limit')
    const cycle = document({})
    cycle.root.data.childrenIds = ['root']
    expect(codes(diagnoseEmailContent({ ...metadata, document: cycle }))).toContain('inspection_limit')
  })

  it('refreshes diagnostics after edits instead of reusing an approved report', () => {
    const source = document({ button: { type: 'Button', data: { props: { url: '#' } } } })
    expect(codes(diagnoseEmailContent({ ...metadata, document: source }))).toContain('action_url')
    ;(source.button as { data: { props: { url: string } } }).data.props.url = 'https://example.com/offers'
    expect(codes(diagnoseEmailContent({ ...metadata, document: source }))).not.toContain('action_url')
  })

  it('distinguishes anchor targets from actions and rejects a URL without a host', () => {
    const issues = diagnoseEmailContent({ ...metadata, html: '<html lang="en"><body><h1>Title</h1><a id="offer">Offer</a><a href="#offer">Jump to offer</a><a href="https://">View offer</a></body></html>' })
    expect(codes(issues)).toEqual(['action_url'])
    expect(issues[0]?.reference?.regionId).toBe('link:a[2]')
  })

  it('does not count empty headings or empty hidden preview containers as meaningful content', () => {
    const issues = diagnoseEmailContent({ subject: 'News', html: '<html lang="en"><body><h1><span> </span></h1><div class="preheader" style="display:none"></div></body></html>' })
    expect(codes(issues)).toEqual(['headings', 'preheader'])
  })

  it('inspects existing section CTA fields and background image metadata', () => {
    const source = document({
      hero: { type: 'hero-section', data: { props: { heading: 'Offers', ctaText: 'View offer', ctaUrl: '#', imageUrl: 'https://cdn.example.com/a.png' } } },
      menu: { type: 'menu', data: { props: { items: [{ label: 'Offer', url: '#' }] } } },
      image: { type: 'Image', data: { props: { alt: null, url: 'https://cdn.example.com/a.png' } } }
    })
    const issues = diagnoseEmailContent({ ...metadata, document: source, imageAssets: [{ url: 'https://cdn.example.com/a.png', fileSize: 600 * 1024 }] })
    expect(issues.filter(issue => issue.code === 'action_url').map(issue => issue.reference?.blockId)).toEqual(['hero', 'menu'])
    expect(codes(issues)).not.toContain('headings')
    expect(codes(issues)).toContain('image_alt')
    const full = diagnoseEmailContent({ ...metadata, document: imported('<html lang="en"><body><h1>Offers</h1><table><tr><td background="https://cdn.example.com/a.png">Offer</td></tr></table></body></html>'), imageAssets: [{ url: 'https://cdn.example.com/a.png', fileSize: 600 * 1024 }] })
    const heavy = full.find(issue => issue.code === 'heavy_image')!
    expect(getHtmlEditableSelection('<html lang="en"><body><h1>Offers</h1><table><tr><td background="https://cdn.example.com/a.png">Offer</td></tr></table></body></html>', heavy.reference!.regionId!)?.imageMode).toBe('background')
  })

  it('extends existing campaign checks with advisory entries while preserving all hard gates', () => {
    const campaign = { subject: 'News', from_email: 'news@example.com', body_html: '<html><body><img src="https://cdn.example.com/a.png"><a href="{{ unsubscribe_url }}">Unsubscribe</a><p>1 Market Street Melbourne VIC 3000</p></body></html>' }
    const good = buildCampaignPreflight({ campaign, toSend: 1, sendingConfigured: true, senderDomainAuthenticated: true })
    expect(good.blocked).toBe(false)
    expect(good.ok).toBe(true)
    expect(good.checks).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'image_alt', status: 'warning', reference: { regionId: 'image:img[0]' } })]))
    const bad = buildCampaignPreflight({ campaign: { ...campaign, from_email: '', body_html: '<img>' }, toSend: 0, sendingConfigured: false, senderDomainAuthenticated: false })
    expect(bad.blocked).toBe(true)
    expect(bad.checks.filter(check => check.status === 'blocked').map(check => check.code)).toEqual(['unsubscribe', 'sender', 'auth_readiness', 'footer_identity', 'recipients'])
  })
})
