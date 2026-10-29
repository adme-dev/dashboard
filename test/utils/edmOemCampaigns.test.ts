import { describe, expect, it } from 'vitest'
import { EDM_STARTER_TEMPLATES, EDM_SECTION_CATEGORIES, buildStarterTemplateDocument } from '~~/app/utils/edmPresets'
import { renderTemplateDocumentLocally } from '~~/workers/email-rendering/src/render/document'
import { buildCampaignPreflight } from '~~/server/utils/email-marketing/campaignSend'

const campaigns = [
  ['oem-launch-interest', 'Register your interest', '/register-interest'],
  ['oem-sale-weekend', 'Grand Automotive Sale Weekend', '/sale-weekend'],
  ['oem-launch-rsvp', 'Vehicle Launch RSVP', '/launch-rsvp']
] as const

describe('OEM-informed dealership campaigns', () => {
  it.each(campaigns)('builds %s with a distinct purpose, real email CTA and sender setup gate', (id, name, path) => {
    expect(EDM_STARTER_TEMPLATES.find(s => s.id === id)?.name).toBe(name)
    const document = buildStarterTemplateDocument(id)
    const html = renderTemplateDocumentLocally(document)
    expect(html).toContain(path)
    expect(html).toContain('<img')
    expect(html).toContain('Unsubscribe')
    expect(html).not.toMatch(/<form|<input|picsum\.photos/)
    const checks = buildCampaignPreflight({ campaign: { subject: name, from_email: 'news@example.com', body_html: html }, toSend: 1, sendingConfigured: true, senderDomainAuthenticated: true }).checks
    expect(checks.find(c => c.code === 'footer_identity')?.status).toBe('blocked')
  })
  it('separates expressions of interest from event attendance and supplies editable event details', () => {
    const interest = renderTemplateDocumentLocally(buildStarterTemplateDocument('oem-launch-interest'))
    const rsvp = renderTemplateDocumentLocally(buildStarterTemplateDocument('oem-launch-rsvp'))
    expect(interest).toContain('launch updates')
    expect(interest).not.toContain('Confirm attendance')
    for (const term of ['Event date', 'Event time', 'Dealership address', 'RSVP by', 'Confirm attendance']) expect(rsvp).toContain(term)
  })
  it('provides example savings and offer conditions without inventing prices or scarcity', () => {
    const html = renderTemplateDocumentLocally(buildStarterTemplateDocument('oem-sale-weekend'))
    for (const term of ['Save thousands', 'selected vehicles', 'Offer start', 'Offer end', 'Offer conditions']) expect(html).toContain(term)
    expect(html).not.toMatch(/\$[0-9]|Only [0-9]+ left|Guaranteed finance/)
  })
  it('refreshes the repetitive CTA modules with image-led, structurally varied layouts', () => {
    const ids = ['modern-electric-cta', 'modern-property-cta', 'modern-hospitality-cta', 'modern-wellness-cta', 'modern-advisory-cta']
    const modules = EDM_SECTION_CATEGORIES.flatMap(c => c.presets).filter(s => ids.includes(s.id))
    expect(modules).toHaveLength(5)
    const variants = new Set<string>()
    for (const module of modules) {
      const html = JSON.stringify(module.blocks)
      expect(html).toContain('<img')
      const layout = html.match(/data-edm-layout=\\"([^\\]+)\\"/)?.[1]
      expect(layout).toBeTruthy()
      variants.add(layout!)
    }
    expect(variants.size).toBeGreaterThanOrEqual(3)
  })
})
