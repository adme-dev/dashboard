import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildBatchEmail, buildCampaignPreflight } from '../../server/utils/email-marketing/campaignSend'
import { BUILTIN_MERGE_CHOICES, isAuthorableMergeToken, MergeDefinitionInputSchema, RESERVED_MERGE_KEYS, sampleMergeVariables } from '../../shared/emailRendering/mergeTagDefinitions'
import { hasWebVersionMergeTag } from '../../server/utils/email-marketing/sendability'
import { wrapConditionalHtml } from '../../shared/emailRendering/conditions'

const signing = vi.hoisted(() => ({ configured: true }))
vi.mock('../../server/utils/email-marketing/links', async original => ({
  ...await original<typeof import('../../server/utils/email-marketing/links')>(),
  emailLinkSecret: () => {
    if (!signing.configured) throw new Error('not configured')
    return 'test-only'
  }
}))
const footer = '<a href="{{unsubscribe_url}}">Unsubscribe</a><footer>Agency, 1 Market Street, Melbourne VIC 3000</footer>'
const campaign = { subject: 'Offers', preview_text: 'Latest offers', from_name: null, from_email: 'news@example.com', reply_to: null, body_html: '<a href="{{web_version_url}}">View online</a>' + footer, review_required: true, web_version_enabled: true }
const recipient = { email: 'alex@example.com', name: 'Alex', subscriber_id: 'sub-1' }
const webUrl = 'https://app.example/email/view?c=campaign&v=digest&t=signature'
const build = (patch = {}) => buildBatchEmail({ ...campaign, ...patch }, recipient, 'campaign', 'https://app.example', 'unsubscribe-signature')
const preflight = (patch = {}, sendingConfigured = true) => buildCampaignPreflight({ campaign: { ...campaign, ...patch }, toSend: 1, sendingConfigured, senderDomainAuthenticated: true })
beforeEach(() => {
  signing.configured = true
})

afterEach(() => vi.unstubAllEnvs())

describe('web-version authoring contract', () => {
  it('reserves the sender-owned token and offers only an inert preview sample', () => {
    expect(RESERVED_MERGE_KEYS).toContain('web_version_url')
    expect(BUILTIN_MERGE_CHOICES).toContainEqual({ name: 'View online URL', token: 'web_version_url', value: '{{web_version_url}}' })
    expect(isAuthorableMergeToken('{{web_version_url}}')).toBe(true)
    expect(MergeDefinitionInputSchema.safeParse({ client_id: '11111111-1111-4111-8111-111111111111', name: 'Fake web link', token: 'web_version_url', preview_value: '', fallback: 'Oops' }).success).toBe(false)
    expect(sampleMergeVariables([], {}).web_version_url).toBe('https://example.invalid/email/view')
  })
  it.each([{ review_required: false }, { web_version_enabled: false }, { review_required: undefined, web_version_enabled: undefined }])('blocks non-gated or not-enabled campaigns: %j', (patch) => {
    expect(preflight(patch).checks).toContainEqual(expect.objectContaining({ code: 'web_version', status: 'blocked', message: expect.stringMatching(/review|enable/i) }))
    expect(preflight(patch).blocked).toBe(true)
  })
  it('blocks unconfigured sending and missing signing configuration with guidance', () => {
    expect(preflight({}, false).blocked).toBe(true)
    signing.configured = false
    expect(preflight().checks).toContainEqual(expect.objectContaining({ code: 'web_version', status: 'blocked', message: expect.stringMatching(/configur/i) }))
  })
  it('permits an enabled gated campaign without issuing a browser URL', () => {
    expect(preflight().checks).toContainEqual(expect.objectContaining({ code: 'web_version', status: 'pass' }))
    expect(preflight().ok).toBe(true)
  })
  it('keeps already-gated web-version readiness through workflow-flag rollback', () => {
    vi.stubEnv('FIGFLOW_EDM_WORKFLOW_ENABLED', 'false')
    expect(preflight().ok).toBe(true)
  })
  it.each(['{{other | web_version_url}}', '{{web_version_url_extra}}', '{{web_version_url', '{{web_version_url | ' + 'x'.repeat(257) + '}}'])('does not invent a supported reserved token from %s', (value) => {
    expect(hasWebVersionMergeTag(value)).toBe(false)
  })
  it.each(['https://example.invalid/email/view', 'javascript:alert(1)', 'https://user:pass@app.example/email/view?c=x&v=x&t=x', 'https://app.example/email/view?c=x&v=x'])('refuses preview-only or malformed supplied web URL %s', (web_version_url) => {
    expect(() => build({ web_version_url })).toThrow(/WEB_VERSION/)
  })
  it('keeps ordinary legacy campaign readiness and unsubscribe unchanged', () => {
    expect(preflight({ body_html: footer, review_required: false, web_version_enabled: false }).ok).toBe(true)
    expect(build({ body_html: footer }).html).toContain('/email/unsubscribe?c=campaign&amp;s=sub-1&amp;t=unsubscribe-signature')
  })
  it.each(['{{web_version_url}}', '{{ WEB_VERSION_URL }}', '{{web_version_url | https://fallback.example/}}'])('refuses a visible unavailable token before empty/fallback substitution: %s', (token) => {
    expect(() => build({ body_html: `<a href="${token}">View online</a>${footer}` })).toThrow(/WEB_VERSION/)
  })
  it.each(['subject', 'preview_text'])('also refuses an unavailable reserved token in %s', (field) => {
    expect(preflight({ body_html: footer, [field]: '{{web_version_url}}', web_version_enabled: false }).blocked).toBe(true)
    expect(() => build({ body_html: footer, [field]: '{{web_version_url}}' })).toThrow(/WEB_VERSION/)
  })
  it('does not confuse similarly named or unsupported keys with the reserved token', () => {
    expect(() => build({ body_html: '<p>{{custom_web_version_url | hello}} {{web_version_url_extra | hello}}</p>' + footer })).not.toThrow()
  })
  it('evaluates frozen conditions before enforcing final token availability', () => {
    const hiddenLink = wrapConditionalHtml('<a href="{{web_version_url}}">VIP online</a>', { version: 1, name: 'VIP', predicate: { field: 'first_name', op: 'equals', value: 'VIP' } }, 'c1')
    expect(build({ body_html: hiddenLink + footer }).html).not.toContain('VIP online')
    expect(() => buildBatchEmail({ ...campaign, body_html: hiddenLink + footer }, { ...recipient, name: 'VIP' }, 'campaign', 'https://app.example')).toThrow(/WEB_VERSION/)
  })
  it('substitutes the server-issued URL once, with HTML escaping', () => {
    expect(build({ web_version_url: webUrl }).html).toContain(`href="${webUrl.replaceAll('&', '&amp;')}"`)
  })
})
