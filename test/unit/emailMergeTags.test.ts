import { describe, expect, it } from 'vitest'
import { createRenderBudget } from '../../shared/emailRendering/bounds'
import { resolveEmailMergeTags } from '../../shared/emailRendering/mergeTags'
import { replaceMergeFields } from '../../workers/email-rendering/src/render/mergeFields'
import { buildBatchEmail, substituteMergeTags } from '../../server/utils/email-marketing/campaignSend'
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
  it('charges escaped chunks before joining and limits output in both contexts', () => {
    expect(() => resolveEmailMergeTags('{{name}}', { name: '<'.repeat(10) }, { budget: createRenderBudget(20) })).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
    expect(() => resolveEmailMergeTags('{{x}}{{x}}{{x}}', { x: '1234567890' }, { context: 'text', budget: createRenderBudget(20) })).toThrow()
  })
})
