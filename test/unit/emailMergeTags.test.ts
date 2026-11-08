import { describe, expect, it } from 'vitest'
import { createRenderBudget } from '../../shared/emailRendering/bounds'
import { resolveEmailMergeTags } from '../../shared/emailRendering/mergeTags'
import { replaceMergeFields } from '../../workers/email-rendering/src/render/mergeFields'
import { buildBatchEmail, substituteMergeTags } from '../../server/utils/email-marketing/campaignSend'
import { rewriteTrackableHrefs } from '../../server/utils/email-marketing/trackingLinks'
import { parseFragment } from 'parse5'
import { renderFlyhubDocumentToHtml } from '../../workers/email-rendering/src/render/flyhub-html-renderer'

const document = { root: { type: 'EmailLayout', data: { childrenIds: ['text'] } }, text: { type: 'Text', data: { props: { text: 'Hello {{ First_Name | there }}' } } } }

describe('shared preview and campaign merge resolution', () => {
  it('resolves spaced, case-insensitive and literal field names with fallbacks in one pass', () => {
    expect(resolveEmailMergeTags('{{ FIRST_NAME | there }} {{site.name}} {{a+}}', { 'first_name': '', 'site.name': 'Site', 'a+': 'plus' })).toBe('there Site plus')
    expect(resolveEmailMergeTags('{{name}} {{other}}', { name: '{{other}}', other: '$&' })).toBe('{{other}} $&amp;')
    expect(resolveEmailMergeTags('{{__proto__}}', {})).toBe('{{__proto__}}')
  })

  it('keeps incomplete authoring tags while clearing unresolved final-send values', () => {
    expect(replaceMergeFields('{{unknown}}', {})).toBe('{{unknown}}')
    expect(substituteMergeTags('{{unknown}}', {})).toBe('')
    expect(resolveEmailMergeTags('{{first_name|there}}', {})).toBe('there')
    expect(resolveEmailMergeTags('{{unfinished', {})).toBe('{{unfinished')
    const oversized = '{{' + ' '.repeat(2000) + 'missing}}'
    expect(resolveEmailMergeTags(oversized, {})).toBe(oversized)
  })

  it('escapes recipient values and fallback text in HTML, while preserving plain subjects', () => {
    const vars = { name: 'A&B <img src=x> "quoted"' }
    expect(resolveEmailMergeTags('<p>{{name}}</p>', vars)).toBe('<p>A&amp;B &lt;img src=x&gt; &quot;quoted&quot;</p>')
    expect(resolveEmailMergeTags('{{name}}', vars, { context: 'text' })).toBe(vars.name)
    expect(resolveEmailMergeTags('{{missing|<script>bad</script>}}', {})).toBe('&lt;script&gt;bad&lt;/script&gt;')
  })

  it('uses the same supplied recipient/fallback values in preview and send without changing unsubscribe headers', () => {
    const campaign = { subject: 'Hi {{ name | friend }}', from_name: null, from_email: 'sender@example.com', reply_to: null, body_html: '<p>{{ name | friend }}</p><a href="{{unsubscribe_url}}">Unsubscribe</a>' }
    const recipient = { email: 'r@example.com', name: 'A&B <img>', subscriber_id: 's1' }
    const send = buildBatchEmail(campaign, recipient, 'c1', 'https://example.com', 'signature')
    const url = 'https://example.com/email/unsubscribe?c=c1&s=s1&t=signature'
    expect(replaceMergeFields(campaign.body_html, { name: recipient.name, unsubscribe_url: url })).toBe(send.html)
    expect(send.html).toContain('A&amp;B &lt;img&gt;')
    expect(send.html).toContain('c=c1&amp;s=s1&amp;t=signature')
    expect(send.subject).toBe('Hi A&B <img>')
    expect(send.headers['List-Unsubscribe']).toBe(`<${url}>`)
  })

  it('escapes metadata before placing it in the generated HTML wrapper', () => {
    const html = renderFlyhubDocumentToHtml(document, { subjectLine: '</title><img src=x>', previewText: '<img src=x onerror=bad()>' })
    expect(html).toContain('<title>&lt;/title&gt;&lt;img src=x&gt;</title>')
    expect(html).toContain('&lt;img src=x onerror=bad()&gt;')
    expect(html).not.toContain('<img src=x')
  })

  it('resolves quoted fallbacks before metadata encoding and decodes compiled body fallbacks once', () => {
    const fallback = `Friend's "team" & more`
    const heading = { root: { type: 'EmailLayout', data: { childrenIds: ['heading'] } }, heading: { type: 'Heading', data: { props: { text: `{{missing|${fallback}}}` } } } }
    const html = renderFlyhubDocumentToHtml(heading, { subjectLine: `{{missing|${fallback}}}`, previewText: `{{missing|${fallback}}}`, variables: {} })
    expect(html).toContain('<title>Friend&#039;s &quot;team&quot; &amp; more</title>')
    expect(html.match(/Friend&#039;s &quot;team&quot; &amp; more/g)).toHaveLength(3)
    expect(html).not.toContain('&amp;#039;')
    expect(substituteMergeTags('<p>{{missing|Friend&#039;s &quot;team&quot; &amp; more}}</p>', {})).toBe('<p>Friend&#039;s &quot;team&quot; &amp; more</p>')
    expect(replaceMergeFields('{{missing|&amp;quot;}}', {})).toBe('&amp;quot;')
    expect(replaceMergeFields('{{missing|' + '&#039;'.repeat(256) + '}}', {})).toBe('&#039;'.repeat(256))
  })
  it('never re-evaluates tokens introduced through metadata values', () => {
    const html = renderFlyhubDocumentToHtml(document, { subjectLine: '{{name}}', previewText: '{{name}}', variables: { name: '{{other}}', other: 'Should not appear' } })
    expect(html).toContain('<title>{{other}}</title>')
    expect(html).not.toContain('Should not appear')
  })
  it('blocks resolved script schemes in final hrefs without rewriting safe urls, preview tokens, or subjects', () => {
    const stored = '<a href="{{ offer_url }}">Offer</a><a href=\'{{ mail }}\'>Mail</a><a href="{{ phone }}">Call</a>'
    expect(substituteMergeTags(stored, {
      offer_url: 'JaVaScRiPt:alert(1)',
      mail: 'mailto:sales@example.com',
      phone: 'tel:+61390000000'
    })).toBe('<a href="#">Offer</a><a href=\'mailto:sales@example.com\'>Mail</a><a href="tel:+61390000000">Call</a>')
    expect(substituteMergeTags('<a href="{{ offer_url }}">Offer</a>', { offer_url: ' \njava\tscript:alert(1)' })).toBe('<a href="#">Offer</a>')
    expect(substituteMergeTags('<a href="{{ offer_url }}">Offer</a>', { offer_url: 'data:text/html,hi' })).toBe('<a href="#">Offer</a>')
    expect(substituteMergeTags('<a href="{{ offer_url }}">Offer</a>', { offer_url: 'vbscript:msgbox(1)' })).toBe('<a href="#">Offer</a>')
    expect(substituteMergeTags('<a href="{{ offer_url }}">Offer</a>', { offer_url: 'https://dealer.example/offer?q="vip"&src=edm' }))
      .toBe('<a href="https://dealer.example/offer?q=&quot;vip&quot;&amp;src=edm">Offer</a>')
    expect(replaceMergeFields('<a href="{{ offer_url }}">Offer</a>', {})).toBe('<a href="{{ offer_url }}">Offer</a>')
    expect(substituteMergeTags('<a href="{{ offer_url }}">Offer</a>', {})).toBe('<a href="">Offer</a>')
    expect(resolveEmailMergeTags('Subject {{ offer_url }}', { offer_url: 'javascript:alert(1)' }, { context: 'text' })).toBe('Subject javascript:alert(1)')
  })

  it('blocks parsed character-reference and unquoted script hrefs before tracking', async () => {
    const blocked = [
      'href="&#106;avascript:alert(1)"',
      'href="&#106avascript:alert(1)"',
      'href="&#x6A;avascript:alert(1)"',
      'href="&#x09;javascript:alert(1)"',
      'href="java&#115;cript:alert(1)"',
      'href="javascript&#58;alert(1)"',
      'href="javascript&colon;alert(1)"',
      'href="&#9;javascript:alert(1)"',
      'href="&Tab;javascript:alert(1)"',
      'href="&#11;javascript:alert(1)"',
      'href="&#100;ata:text/html,hi"',
      'href=javascript:alert(1)',
      'href=&#106;avascript:alert(1)'
    ]
    for (const attribute of blocked) {
      expect(substituteMergeTags(`<a ${attribute}>Offer</a>`, {})).toBe('<a href="#">Offer</a>')
    }
    expect(substituteMergeTags('<a href="https://dealer.example/o&#039;brien">Offer</a>', {})).toBe('<a href="https://dealer.example/o&#039;brien">Offer</a>')
    expect(substituteMergeTags('<a href="{{ offer_url }}">Offer</a>', { offer_url: '&#106;avascript:alert(1)' })).toBe('<a href="&amp;#106;avascript:alert(1)">Offer</a>')
    const recipient = { email: 'r@example.com', name: 'Ari', subscriber_id: 's1' }
    const send = buildBatchEmail({
      subject: 'javascript:alert(1)',
      from_name: null,
      from_email: 'sender@example.com',
      reply_to: null,
      body_html: '<a href="&#106;avascript:alert(1)">Offer</a><a href="https://dealer.example/offer">Offer</a><noscript><a href="javascript:alert(1)">No script</a></noscript><svg><a xlink:href="javascript:alert(1)">SVG</a></svg><a href="{{unsubscribe_url}}">Unsubscribe</a>',
      preview_text: 'Preview'
    }, recipient, 'c1', 'https://example.com', 'signature')
    expect(send.subject).toBe('javascript:alert(1)')
    expect(send.html).toContain('<a href="#">Offer</a>')
    expect(send.html).toContain('<noscript><a href="#">No script</a></noscript>')
    expect(send.html).toContain('<svg><a xlink:href="#">SVG</a></svg>')
    expect(send.html).not.toContain('&#106;')
    const seen: string[] = []
    const tracked = await rewriteTrackableHrefs(send.html, (href) => {
      seen.push(href)
      return 'https://click.example/go'
    })
    expect(seen).toEqual(['https://dealer.example/offer'])
    expect(tracked).toContain('href="#"')
    expect(tracked).not.toContain('javascript:')
    const node = parseFragment(tracked).childNodes.find(child => 'attrs' in child && child.attrs.some(attribute => attribute.name === 'href' && attribute.value === '#'))
    expect(node).toBeTruthy()
  })

  it('neutralizes a namespaced SVG href and preserves safe namespace URLs', () => {
    const stored = '<svg><a xlink:href="&#106;avascript:alert(1)" href="mailto:sales@example.com">Offer</a></svg>'
    const output = substituteMergeTags(stored, {})
    expect(output).toBe('<svg><a xlink:href="#" href="mailto:sales@example.com">Offer</a></svg>')
    const svg = parseFragment(output).childNodes[0]
    const anchor = svg && 'childNodes' in svg ? svg.childNodes[0] : undefined
    const attributes = anchor && 'attrs' in anchor ? anchor.attrs : []
    expect(attributes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'href', prefix: 'xlink', namespace: 'http://www.w3.org/1999/xlink', value: '#' }),
      expect.objectContaining({ name: 'href', value: 'mailto:sales@example.com' })
    ]))
    const safe = '<svg><a xlink:href="https://dealer.example/o&#039;brien">Offer</a></svg>'
    expect(substituteMergeTags(safe, {})).toBe(safe)
  })

  it('parses noscript links in non-scripting mode without changing safe fallback content', () => {
    const output = substituteMergeTags('<noscript><a href="javascript&#58;alert(1)">Offer</a></noscript>', {})
    expect(output).toBe('<noscript><a href="#">Offer</a></noscript>')
    const scripting = parseFragment(output).childNodes[0]
    const text = scripting && 'childNodes' in scripting ? scripting.childNodes[0] : undefined
    expect(text && 'value' in text ? text.value : '').toBe('<a href="#">Offer</a>')
    const nonScripting = parseFragment(output, { scriptingEnabled: false }).childNodes[0]
    const anchor = nonScripting && 'childNodes' in nonScripting ? nonScripting.childNodes[0] : undefined
    expect(anchor && 'attrs' in anchor ? anchor.attrs : []).toEqual([
      expect.objectContaining({ name: 'href', value: '#' })
    ])
    const safe = '<noscript><a href="https://dealer.example/offer">Offer</a></noscript>'
    expect(substituteMergeTags(safe, {})).toBe(safe)
  })

  it('neutralizes later duplicate href spans while parse5 retains the safe first URL', () => {
    const safeFirst = substituteMergeTags('<a href="https://dealer.example/offer" href="javascript:alert(1)" href="data:text/html,hi">Offer</a>', {})
    expect(safeFirst).toBe('<a href="https://dealer.example/offer" href="#" href="#">Offer</a>')
    const safeAnchor = parseFragment(safeFirst).childNodes[0]
    expect(safeAnchor && 'attrs' in safeAnchor ? safeAnchor.attrs : []).toEqual([
      expect.objectContaining({ name: 'href', value: 'https://dealer.example/offer' })
    ])
    const unsafeFirst = substituteMergeTags('<a href="javascript:alert(1)" href="https://dealer.example/offer">Offer</a>', {})
    expect(unsafeFirst).toBe('<a href="#" href="https://dealer.example/offer">Offer</a>')
    const unsafeAnchor = parseFragment(unsafeFirst).childNodes[0]
    expect(unsafeAnchor && 'attrs' in unsafeAnchor ? unsafeAnchor.attrs : []).toEqual([
      expect.objectContaining({ name: 'href', value: '#' })
    ])
  })

  it('neutralizes Outlook conditional-comment hrefs without rewriting safe comment bytes', () => {
    const stored = '<!--[if mso]><v:roundrect href="javascript&#58;alert(1)"><![endif]-->'
    expect(substituteMergeTags(stored, {})).toBe('<!--[if mso]><v:roundrect href="#"><![endif]-->')
    const safe = '<!--[if mso]><v:roundrect href="https://dealer.example/o&#039;brien"><![endif]-->'
    expect(substituteMergeTags(safe, {})).toBe(safe)
  })

  it('uses parser locations for malformed start tags and leaves an unclosed quote untouched', () => {
    const output = substituteMergeTags('<a/href=javascript:alert(1) title=Keep>Offer</a>', {})
    expect(output).toBe('<a/href="#" title=Keep>Offer</a>')
    const anchor = parseFragment(output).childNodes[0]
    expect(anchor && 'attrs' in anchor ? anchor.attrs : []).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'href', value: '#' }),
      expect.objectContaining({ name: 'title', value: 'Keep' })
    ]))
    const unclosed = '<a href="javascript:alert(1)>Offer</a>'
    expect(substituteMergeTags(unclosed, {})).toBe(unclosed)
    const duplicate = substituteMergeTags('<a href=https://dealer.example/offer href=&#106;avascript:alert(1)>Offer</a>', {})
    expect(duplicate).toBe('<a href=https://dealer.example/offer href="#">Offer</a>')
  })

  it('charges escaped chunks before joining and limits output in both contexts', () => {
    expect(() => resolveEmailMergeTags('{{name}}', { name: '<'.repeat(10) }, { budget: createRenderBudget(20) })).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
    expect(() => resolveEmailMergeTags('{{x}}{{x}}{{x}}', { x: '1234567890' }, { context: 'text', budget: createRenderBudget(20) })).toThrow()
  })
})
