import { describe, expect, it } from 'vitest'
import { inspectDeliveryContent, isUsableUnsubscribeHref } from '../../shared/emailRendering/deliveryContent'
import { buildBatchEmail, buildTrackedBatchEmail, bodyHasUnsubscribe } from '../../server/utils/email-marketing/campaignSend'
import { wrapConditionalHtml } from '../../shared/emailRendering/conditions'

const footer = '<footer>Agency, 1 Market Street, Melbourne VIC 3000</footer>'
const unsubscribe = '<a href="{{unsubscribe_url}}">Unsubscribe</a>'
const campaign = { subject: 'Hi {{first_name}}', from_email: 'hello@example.com', from_name: null, reply_to: null, body_html: `<p>Hello {{first_name}}</p>${unsubscribe}${footer}` }
const recipient = { email: 'person@example.com', name: 'Alex & team', subscriber_id: 's1' }
const tracking = { appUrl: 'https://app.test', campaignId: 'c1', subscriberId: 's1', secret: 'synthetic-secret' }

describe('bounded static delivery content checks', () => {
  it('ignores comment, hidden subtree, class-hidden and zero-size decoys', () => {
    for (const html of [
      `<!--${unsubscribe}-->`, `<div hidden>${unsubscribe}</div>`, `<div style="display:none">${unsubscribe}</div>`,
      `<div aria-hidden="true">${unsubscribe}</div>`, `<style>.hidden {display:none !important}</style><p class="hidden">${unsubscribe}</p>`,
      `<div style="font-size:0px">${unsubscribe}</div>`, `<a href="https://example.com/offers?unsubscribe=1">Unsubscribe</a>`
    ]) expect(bodyHasUnsubscribe(html)).toBe(false)
    expect(bodyHasUnsubscribe(unsubscribe)).toBe(true)
    expect(inspectDeliveryContent(`<div hidden>Secret</div><p>Visible &amp; readable</p>`).text).toBe('Visible & readable')
  })
  it('requires a real HTTPS endpoint and bounded parseable content', () => {
    expect(isUsableUnsubscribeHref('https://app.test/email/unsubscribe?c=1')).toBe(true)
    for (const href of ['#unsubscribe', 'javascript:unsubscribe()', 'https://example.com/?unsubscribe=true', 'http://app.test/unsubscribe', 'https://user:pass@app.test/unsubscribe']) expect(isUsableUnsubscribeHref(href)).toBe(false)
    expect(() => inspectDeliveryContent('<div>'.repeat(120) + 'text' + '</div>'.repeat(120))).toThrow('DELIVERY_INSPECTION_LIMIT')
  })
  it('evaluates frozen conditions before recipient merge and never interprets inserted recipient text as a condition', async () => {
    const open = wrapConditionalHtml('', { version: 1, name: 'Known name', predicate: { field: 'first_name', op: 'exists' } }, 'c1').replace('<!--xf-condition:v1:close:c1-->', '')
    const body = `${open}<p>Named {{first_name}}</p><!--xf-condition:v1:close:c1-->${unsubscribe}${footer}`
    const email = buildBatchEmail({ ...campaign, body_html: body }, { ...recipient, name: null }, 'c1', 'https://app.test')
    expect(email.html).not.toContain('Named')
    expect(email.html).not.toContain('xf-condition')
    const sent = await buildTrackedBatchEmail({ ...campaign, body_html: `${body}<a href="https://example.com/deal?a=1&amp;b=2">Offer</a>` }, recipient, 'c1', 'https://app.test', 'signature', tracking)
    expect(sent.html).toContain('Named Alex')
    expect(sent.html).toContain('/email/click?')
    expect(sent.text).toContain('Agency, 1 Market Street')
    expect(sent.text).toContain('https://app.test/email/unsubscribe?c=c1&s=s1&t=signature')
  })
  it('blocks post-condition footer/unsubscribe loss, invalid markers and incomplete tokens before delivery', async () => {
    const open = wrapConditionalHtml('', { version: 1, name: 'Name', predicate: { field: 'first_name', op: 'equals', value: 'No match' } }, 'c1').replace('<!--xf-condition:v1:close:c1-->', '')
    for (const body of [
      `${open}${unsubscribe}${footer}<!--xf-condition:v1:close:c1--><p>Offer</p>`,
      `<p>Offer</p>${unsubscribe}<div hidden>${footer}</div>`,
      `<p>{{unfinished</p>${unsubscribe}${footer}`,
      `<!--xf-condition:v1:close:c1-->${unsubscribe}${footer}`
    ]) await expect(buildTrackedBatchEmail({ ...campaign, body_html: body }, recipient, 'c1', 'https://app.test', 'sig', tracking)).rejects.toThrow()
  })
})
