/**
 * M06 review workflow — pure contracts (no database): block lineage outline,
 * strict command bodies, client pending-action freezing, hosted web version
 * signature/content/PII/CSP denial, and UTM/tracking escaping parity.
 * The database-enforced gate is covered by emailReviewWorkflowPostgres.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { outlineReviewBlocks, reviewBlockLabel } from '../../shared/emailRendering/reviewBlocks'
import { ReviewCommandBody, toReviewCommandInput } from '../../server/utils/email-marketing/reviewHttp'
import { approvalIsCurrent, assertCampaignApprovalCurrent, isEmailReviewWorkflowEnabled, mapReviewDbError, reviewPayloadSha256 } from '../../server/utils/email-marketing/review'
import {
  buildWebVersionUrl,
  renderFrozenWebVersion,
  verifyWebVersionRequest,
  webVersionAvailable,
  WEB_VERSION_CSP,
  WEB_VERSION_HEADERS,
  type FrozenWebVersionRow
} from '../../server/utils/email-marketing/webVersion'
import { signEmailToken } from '../../server/utils/email-marketing/links'
import {
  appendEmailUtm,
  decorateHtmlLinksWithUtm,
  isTrackableEmailHref,
  parseEmailUtmSettings,
  rewriteHtmlLinksForTracking,
  storedEmailUtmSettings
} from '../../server/utils/email-marketing/trackingLinks'
import { buildTrackedBatchEmail, recipientVars } from '../../server/utils/email-marketing/campaignSend'
import { wrapConditionalHtml } from '../../shared/emailRendering/conditions'
import { buildReviewCommand, classifyReviewError, commentThreads, pendingAction } from '../../app/utils/emailReviewClient'

const SECRET = 'test-email-link-secret'
const CAMPAIGN = '6f2b1a0c-1d2e-4f3a-9b8c-7d6e5f4a3b2c'
const OTHER = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const SUBSCRIBER = '11111111-2222-4333-8444-555555555555'
const DIGEST = 'a'.repeat(64)
const DIGEST2 = 'b'.repeat(64)

function document() {
  return {
    root: { type: 'EmailLayout', data: { childrenIds: ['hero', 'cols', 'footer'] } },
    hero: { type: 'Heading', data: { props: { text: '<b>Spring</b>&nbsp;sale <script>x</script>' } } },
    cols: { type: 'ColumnsContainer', data: { props: { columns: [{ childrenIds: ['left'] }, { childrenIds: ['right'] }] } } },
    left: { type: 'Text', data: { props: { text: 'Left column' } } },
    right: { type: 'Button', data: { props: { label: 'Book now', url: 'https://example.com' } } },
    footer: { type: 'footer', data: { props: {} } },
    stray: { type: 'Text', data: { props: { text: 'not reachable' } } }
  }
}

describe('review block outline (stable comment anchors)', () => {
  it('lists only reachable blocks in document order with depth, including column children', () => {
    expect(outlineReviewBlocks(document()).map(block => [block.id, block.depth])).toEqual([
      ['hero', 1], ['cols', 1], ['left', 2], ['right', 2], ['footer', 1]
    ])
  })

  it('labels are bounded plain text, never HTML', () => {
    const label = reviewBlockLabel({ type: 'Text', data: { props: { text: `<p>${'x'.repeat(300)}</p>` } } })
    expect(label).not.toMatch(/[<>]/)
    expect(label.length).toBeLessThanOrEqual(80)
    expect(outlineReviewBlocks(document())[0]!.label).toBe('Spring sale x')
  })

  it('survives cycles, prototype keys, invalid ids and non-documents', () => {
    const doc = document() as Record<string, unknown>
    ;(doc.left as { data: { childrenIds: string[] } }).data = { childrenIds: ['cols', '__proto__', 'bad id'] } as never
    const ids = outlineReviewBlocks(doc).map(block => block.id)
    expect(ids.filter(id => id === 'cols')).toHaveLength(1)
    expect(ids).not.toContain('__proto__')
    expect(outlineReviewBlocks(null)).toEqual([])
    expect(outlineReviewBlocks('<html>')).toEqual([])
  })

  it('a deleted block disappears from the outline (its comments become orphaned, never reassigned)', () => {
    const doc = document()
    doc.root.data.childrenIds = ['cols', 'footer']
    expect(outlineReviewBlocks(doc).map(block => block.id)).not.toContain('hero')
  })
})

const base = {
  version: 1,
  operationId: '9d7c1f8e-2b3a-4c5d-8e6f-7a8b9c0d1e2f',
  scope: { clientId: null },
  expectedVersion: 0,
  expectedContentDigest: DIGEST
}

describe('strict review command bodies', () => {
  it('accepts exactly the documented shapes', () => {
    expect(ReviewCommandBody.safeParse({ ...base, command: 'submit' }).success).toBe(true)
    expect(ReviewCommandBody.safeParse({ ...base, command: 'comment', blockId: 'hero', parentId: null, body: 'Tighten copy' }).success).toBe(true)
  })

  it('cannot assign approval, digests, state or actor from browser JSON', () => {
    for (const extra of [{ approved: true }, { state: 'approved' }, { contentDigest: DIGEST2 }, { actorId: SUBSCRIBER }, { approvalHash: DIGEST }]) {
      expect(ReviewCommandBody.safeParse({ ...base, command: 'approve', ...extra }).success).toBe(false)
    }
    expect(ReviewCommandBody.safeParse({ ...base, version: 2, command: 'approve' }).success).toBe(false)
    expect(ReviewCommandBody.safeParse({ ...base, command: 'set_state', state: 'approved' }).success).toBe(false)
    expect(ReviewCommandBody.safeParse({ ...base, expectedContentDigest: 'A'.repeat(64), command: 'approve' }).success).toBe(false)
    expect(ReviewCommandBody.safeParse({ ...base, command: 'comment', blockId: 'a b', parentId: null, body: 'x' }).success).toBe(false)
    expect(ReviewCommandBody.safeParse({ ...base, command: 'comment', blockId: null, parentId: null, body: 'x'.repeat(2001) }).success).toBe(false)
  })

  it('takes the actor from the session, never the body', () => {
    const parsed = ReviewCommandBody.parse({ ...base, command: 'approve' })
    const input = toReviewCommandInput({ token: 't', userId: SUBSCRIBER }, 'campaign', CAMPAIGN, parsed)
    expect(input.actorId).toBe(SUBSCRIBER)
    expect(input.payload).toEqual({ command: 'approve' })
  })

  it('operation receipts bind domain, target and payload', async () => {
    const one = { kind: 'campaign' as const, targetId: CAMPAIGN, expectedClientId: null, expectedVersion: 0, expectedContentDigest: DIGEST, payload: { command: 'submit' as const } }
    const same = await reviewPayloadSha256(one)
    expect(await reviewPayloadSha256({ ...one })).toBe(same)
    expect(await reviewPayloadSha256({ ...one, targetId: OTHER })).not.toBe(same)
    expect(await reviewPayloadSha256({ ...one, kind: 'template' })).not.toBe(same)
    expect(await reviewPayloadSha256({ ...one, payload: { command: 'approve' } })).not.toBe(same)
    expect(await reviewPayloadSha256({ ...one, expectedContentDigest: DIGEST2 })).not.toBe(same)
  })
})

describe('approval currency and legacy campaigns', () => {
  it('is current only for the exact approved digest', () => {
    expect(approvalIsCurrent({ state: 'approved', content_digest: DIGEST }, DIGEST)).toBe(true)
    expect(approvalIsCurrent({ state: 'approved', content_digest: DIGEST }, DIGEST2)).toBe(false)
    expect(approvalIsCurrent({ state: 'in_review', content_digest: DIGEST }, DIGEST)).toBe(false)
    expect(approvalIsCurrent({ state: 'approved', content_digest: null }, DIGEST)).toBe(false)
  })

  it('legacy (review_required = false) campaigns pass without any query', async () => {
    const db = { query: vi.fn() }
    await expect(assertCampaignApprovalCurrent({ id: CAMPAIGN, review_required: false }, db)).resolves.toBeUndefined()
    await expect(assertCampaignApprovalCurrent({ id: CAMPAIGN }, db)).resolves.toBeUndefined()
    expect(db.query).not.toHaveBeenCalled()
  })

  it('reviewed campaigns are refused unless the database digest matches the approval', async () => {
    const row = (state: string | null, approved: string | null, digest: string) => ({ query: vi.fn(async () => ({ rows: [{ state, content_digest: approved, digest }] })) })
    await expect(assertCampaignApprovalCurrent({ id: CAMPAIGN, review_required: true }, row('approved', DIGEST, DIGEST))).resolves.toBeUndefined()
    for (const db of [row('approved', DIGEST, DIGEST2), row('in_review', DIGEST, DIGEST), row(null, null, DIGEST)]) {
      await expect(assertCampaignApprovalCurrent({ id: CAMPAIGN, review_required: true }, db)).rejects.toMatchObject({ statusCode: 409, statusMessage: 'campaign_approval_required' })
    }
  })

  it('maps only the review constraints to readable 409s', () => {
    expect(mapReviewDbError({ constraint: 'email_campaign_approval_required' })).toMatchObject({ statusCode: 409, statusMessage: 'campaign_approval_required' })
    expect(mapReviewDbError({ constraint: 'email_campaign_content_frozen' })).toMatchObject({ statusMessage: 'campaign_content_frozen' })
    const other = { constraint: 'campaigns_pkey' }
    expect(mapReviewDbError(other)).toBe(other)
  })
})

describe('FIGFLOW_EDM_WORKFLOW_ENABLED gate', () => {
  const previous = process.env.FIGFLOW_EDM_WORKFLOW_ENABLED
  afterEach(() => {
    if (previous === undefined) delete process.env.FIGFLOW_EDM_WORKFLOW_ENABLED
    else process.env.FIGFLOW_EDM_WORKFLOW_ENABLED = previous
  })
  it('is off by default and a request binding wins over process.env', () => {
    delete process.env.FIGFLOW_EDM_WORKFLOW_ENABLED
    expect(isEmailReviewWorkflowEnabled()).toBe(false)
    expect(isEmailReviewWorkflowEnabled({ FIGFLOW_EDM_WORKFLOW_ENABLED: 'true' })).toBe(true)
    process.env.FIGFLOW_EDM_WORKFLOW_ENABLED = 'true'
    expect(isEmailReviewWorkflowEnabled({ FIGFLOW_EDM_WORKFLOW_ENABLED: 'false' })).toBe(false)
    expect(isEmailReviewWorkflowEnabled({ FIGFLOW_EDM_WORKFLOW_ENABLED: '1' })).toBe(false)
  })
})

describe('client pending actions', () => {
  it('freezes the exact body the user acted on; later view/composer changes cannot alter it', () => {
    const view = { clientId: null, version: 3, contentDigest: DIGEST }
    const details = { command: 'comment' as const, blockId: 'hero', parentId: null, body: 'Fix the date' }
    const body = buildReviewCommand(view, details)
    details.body = 'edited later'
    view.contentDigest = DIGEST2
    const action = pendingAction('campaign', CAMPAIGN, body)
    expect(action.body).toMatchObject({ expectedVersion: 3, expectedContentDigest: DIGEST, body: 'Fix the date' })
    expect(() => {
      (action.body as { body: string }).body = 'x'
    }).toThrow()
    expect(Object.isFrozen(action.body.scope)).toBe(true)
  })

  it('treats network/5xx as unknown (retry same body), 409 as conflict, other 4xx as rejected', () => {
    expect(classifyReviewError(new TypeError('fetch failed')).kind).toBe('unknown')
    expect(classifyReviewError({ statusCode: 503, data: { statusMessage: 'review_outcome_unknown' } })).toEqual({ kind: 'unknown', code: 'review_outcome_unknown' })
    expect(classifyReviewError({ statusCode: 409, data: { statusMessage: 'review_content_changed' } }).kind).toBe('conflict')
    expect(classifyReviewError({ statusCode: 403 }).kind).toBe('rejected')
  })

  it('groups replies under their root thread', () => {
    const c = (id: string, parentId: string | null) => ({ id, parentId, blockId: 'hero', body: id, authorId: 'a', authorName: null, contentDigest: DIGEST, createdAt: '', resolvedAt: null, orphaned: false, outdated: false })
    expect(commentThreads([c('r', null), c('x', 'r'), c('s', null)]).map(t => [t.id, t.replies.map(r => r.id)])).toEqual([['r', ['x']], ['s', []]])
  })
})

function frozenRow(overrides: Partial<FrozenWebVersionRow> = {}): FrozenWebVersionRow {
  return {
    id: CAMPAIGN,
    status: 'sent',
    web_version_enabled: true,
    review_required: true,
    subject: 'Spring',
    utm_settings: { source: 'newsletter', campaign: 'spring-26' },
    digest: DIGEST,
    body_html: '<html><body><p>Hi {{first_name | there}} ({{email}}) {{name}}</p>'
      + wrapConditionalHtml('<p>Only Alex</p>', { version: 1, name: 'Alex', predicate: { field: 'first_name', op: 'equals', value: 'Alex' } }, 'c1')
      + '<a href="https://shop.example/a?x=1&amp;y=2">Shop</a><a href="{{unsubscribe_url}}">Unsubscribe</a>'
      + '<script>alert(document.cookie)</script><iframe src="https://evil.example"></iframe></body></html>',
    ...overrides
  }
}

describe('hosted web version', () => {
  it('signs a purpose-bound URL over campaign + frozen digest only', async () => {
    const url = new URL(await buildWebVersionUrl('https://app.example/', CAMPAIGN, DIGEST, SECRET))
    expect(url.pathname).toBe('/email/view')
    expect([...url.searchParams.keys()].sort()).toEqual(['c', 't', 'v'])
    expect(url.search).not.toContain(SUBSCRIBER)
    const query = Object.fromEntries(url.searchParams)
    expect(await verifyWebVersionRequest(query, SECRET)).toEqual({ campaignId: CAMPAIGN, contentDigest: DIGEST })
  })

  it('denies tampered campaign/version, wrong secret and cross-purpose tokens', async () => {
    const t = await signEmailToken(SECRET, 'webview', CAMPAIGN, DIGEST)
    expect(await verifyWebVersionRequest({ c: OTHER, v: DIGEST, t }, SECRET)).toBeNull()
    expect(await verifyWebVersionRequest({ c: CAMPAIGN, v: DIGEST2, t }, SECRET)).toBeNull()
    expect(await verifyWebVersionRequest({ c: CAMPAIGN, v: DIGEST, t }, 'other-secret')).toBeNull()
    // Unsubscribe and click tokens over the same ids never open the web version, and vice versa.
    const unsub = await signEmailToken(SECRET, 'unsub', CAMPAIGN, DIGEST)
    const click = await signEmailToken(SECRET, 'click', CAMPAIGN, DIGEST)
    expect(await verifyWebVersionRequest({ c: CAMPAIGN, v: DIGEST, t: unsub }, SECRET)).toBeNull()
    expect(await verifyWebVersionRequest({ c: CAMPAIGN, v: DIGEST, t: click }, SECRET)).toBeNull()
    expect(t).not.toBe(await signEmailToken(SECRET, 'unsub', CAMPAIGN, SUBSCRIBER))
    expect(await verifyWebVersionRequest({ c: [CAMPAIGN], v: DIGEST, t: 'zz' }, SECRET)).toBeNull()
  })

  it('is available only for opted-in, gated, frozen campaigns whose current digest equals the signed version', () => {
    const request = { campaignId: CAMPAIGN, contentDigest: DIGEST }
    expect(webVersionAvailable(frozenRow(), request)).toBe(true)
    expect(webVersionAvailable(frozenRow({ status: 'draft' }), request)).toBe(false)
    expect(webVersionAvailable(frozenRow({ status: 'cancelled' }), request)).toBe(false)
    expect(webVersionAvailable(frozenRow({ web_version_enabled: false }), request)).toBe(false)
    // Ungated campaigns never have a web version: their content is not frozen.
    expect(webVersionAvailable(frozenRow({ review_required: false }), request)).toBe(false)
    expect(webVersionAvailable(frozenRow({ review_required: undefined }), request)).toBe(false)
    expect(webVersionAvailable(frozenRow({ digest: DIGEST2 }), request)).toBe(false)
    expect(webVersionAvailable(frozenRow({ body_html: '' }), request)).toBe(false)
    expect(webVersionAvailable(null, request)).toBe(false)
  })

  it('renders frozen HTML with no subscriber data, generic conditions, no script and UTM-only links', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const html = await renderFrozenWebVersion(frozenRow())
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    expect(html).toContain('Hi there ()')
    expect(html).not.toContain('Only Alex')
    expect(html).not.toMatch(/\{\{|\}\}/)
    expect(html).not.toMatch(/<script|<iframe/i)
    expect(html).toContain('href="https://shop.example/a?x=1&amp;y=2&amp;utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=spring-26"')
    expect(html).not.toContain('email_click_id')
    expect(html).not.toContain('/email/click')
  })

  it('never evaluates recipient-inserted tokens (single pass)', async () => {
    const html = await renderFrozenWebVersion(frozenRow({ body_html: '<p>{{first_name | {{email}}}}</p><p>{{name}}</p>' }))
    expect(html).not.toContain('@')
  })

  it('ships a restrictive CSP/sandbox with no script, framing or credentials', () => {
    expect(WEB_VERSION_CSP).toContain('default-src \'none\'')
    expect(WEB_VERSION_CSP).not.toMatch(/script-src|connect-src/)
    expect(WEB_VERSION_CSP).toContain('frame-ancestors \'none\'')
    expect(WEB_VERSION_CSP).toMatch(/sandbox(?![^;]*allow-scripts)(?![^;]*allow-same-origin)/)
    expect(WEB_VERSION_HEADERS['referrer-policy']).toBe('no-referrer')
    expect(WEB_VERSION_HEADERS['cache-control']).toBe('no-store')
    expect(Object.keys(WEB_VERSION_HEADERS)).not.toContain('set-cookie')
  })
})

describe('campaign UTM settings and tracking parity', () => {
  it('parses strictly and reads stored values leniently', () => {
    expect(parseEmailUtmSettings({ source: ' news ', term: '' })).toEqual({ source: 'news' })
    expect(parseEmailUtmSettings({})).toBeNull()
    for (const bad of [[], 'x', { other: 'x' }, { source: 'a"b' }, { source: '<x>' }, { source: 'x'.repeat(101) }, { source: 3 }]) {
      expect(() => parseEmailUtmSettings(bad)).toThrow('INVALID_UTM_SETTINGS')
    }
    expect(storedEmailUtmSettings({ source: '<bad>' })).toBeNull()
  })

  it('keeps historical defaults, applies settings, and never overrides authored parameters', () => {
    expect(appendEmailUtm('https://a.example/p', CAMPAIGN)).toBe(`https://a.example/p?utm_source=email&utm_medium=email&utm_campaign=${CAMPAIGN}`)
    const url = new URL(appendEmailUtm('https://a.example/p?utm_source=fb', CAMPAIGN, 'click-1', { source: 'news', campaign: 'spring', content: 'hero' }))
    expect(url.searchParams.get('utm_source')).toBe('fb')
    expect(url.searchParams.get('utm_campaign')).toBe('spring')
    expect(url.searchParams.get('utm_content')).toBe('hero')
    expect(url.searchParams.get('email_click_id')).toBe('click-1')
  })

  it('UTM decoration and click tracking share one parse/escape contract and skip the same links', async () => {
    const html = '<a href="https://a.example/?q=1&amp;r=2">A</a><a href=\'https://b.example/x\'>B</a>'
      + '<a href="{{unsubscribe_url}}">U</a><a href="https://app.example/unsubscribe?x">U2</a><a href="mailto:a@b.c">M</a>'
      + `<a href="https://app.example/email/view?c=${CAMPAIGN}&amp;v=${DIGEST}&amp;t=${'c'.repeat(32)}">Web</a>`
    const decorated = await decorateHtmlLinksWithUtm(html, CAMPAIGN, null)
    const tracked = await rewriteHtmlLinksForTracking(html, { appUrl: 'https://app.example', campaignId: CAMPAIGN, subscriberId: SUBSCRIBER, secret: SECRET })
    for (const out of [decorated, tracked]) {
      expect(out).toContain('href="{{unsubscribe_url}}"')
      expect(out).toContain('href="https://app.example/unsubscribe?x"')
      expect(out).toContain('href="mailto:a@b.c"')
      expect(out).toContain(`/email/view?c=${CAMPAIGN}&amp;v=${DIGEST}`)
      expect(out).not.toMatch(/&(?!amp;)/)
    }
    expect(decorated).toContain('href="https://a.example/?q=1&amp;r=2&amp;utm_source=email')
    expect(decorated).toContain('href=\'https://b.example/x?utm_source=email')
    // The decoded logical URL (not the escaped text) is what gets signed.
    expect(tracked).toContain(encodeURIComponent('https://a.example/?q=1&r=2'))
    expect(isTrackableEmailHref(`https://app.example/email/view?c=${CAMPAIGN}&v=${DIGEST}&t=x`)).toBe(false)
    expect(isTrackableEmailHref('https://app.example/email/view')).toBe(true)
  })
})

describe('send path keeps the web version recipient-free and conditions before merge', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('passes one shared web version URL; recipient-inserted values are never re-evaluated', async () => {
    const webUrl = await buildWebVersionUrl('https://app.example', CAMPAIGN, DIGEST, SECRET)
    expect(recipientVars({ email: 'a@b.c', name: null }, 'https://u', webUrl).web_version_url).toBe(webUrl)
    expect(recipientVars({ email: 'a@b.c', name: null }, 'https://u')).not.toHaveProperty('web_version_url')
    const body = '<html><body><p>Hi {{first_name | there}}</p>'
      + wrapConditionalHtml('<p>VIP</p>', { version: 1, name: 'VIP', predicate: { field: 'first_name', op: 'equals', value: 'Alex' } }, 'c1')
      + '<a href="{{web_version_url}}">View in browser</a><a href="https://shop.example/?a=1">Shop</a>'
      + '<a href="{{unsubscribe_url}}">Unsubscribe</a><p>ADME Pty Ltd, 1 Example St, Melbourne VIC 3000</p></body></html>'
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const email = await buildTrackedBatchEmail(
      { subject: 'Hello', from_name: 'ADME', from_email: 'news@adme.example', reply_to: null, body_html: body, web_version_url: webUrl },
      { email: 'alex@example.com', name: 'Alex {{email}}', subscriber_id: SUBSCRIBER },
      CAMPAIGN,
      'https://app.example',
      'unsubtoken',
      { appUrl: 'https://app.example', campaignId: CAMPAIGN, subscriberId: SUBSCRIBER, secret: SECRET }
    ).catch((error: unknown) => ({ error }))
    expect(fetchSpy).not.toHaveBeenCalled()
    if ('error' in email) throw email.error
    expect(email.html).toContain('<p>VIP</p>')
    expect(email.html).toContain('Hi Alex')
    expect(email.html).not.toContain('alex@example.com')
    const escaped = webUrl.replaceAll('&', '&amp;')
    expect(email.html).toContain(`href="${escaped}"`)
    expect(email.html).toContain('/email/click?')
  })
})
