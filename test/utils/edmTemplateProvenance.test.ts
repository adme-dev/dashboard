/* eslint-disable @typescript-eslint/no-explicit-any -- Malformed imported metadata fixtures. */
import { redactTemplateProvenance } from '~~/shared/emailRendering/templateProvenance'
import { describe, expect, it } from 'vitest'
import { templateSourceDetails, buildTemplateExport, templateCopyCategory, templateCopyName } from '~~/app/utils/edmTemplateProvenance'
import { prepareTemplateImport } from '~~/server/utils/email-marketing/templateImport'

const document = { root: { type: 'EmailLayout', data: { childrenIds: ['body'], props: { sourceProvenance: { provider: 'Sesimi', make: 'Geely', assetId: 'abc', retrievedAt: '2026-10-29', sourceUrl: 'https://geely-au.sesimi.app/assets/export/abc/?token=secret', originalSha256: 'a'.repeat(64), notes: 'Review dealership and dates.', approvalState: 'approved', importForm: 'flattened-html-snapshot' } } } }, body: { type: 'Html', data: { props: { contents: '<p>Vehicle launch</p>' } } } }
describe('template source details and portable backups', () => {
  it('reads bounded recorded source details without treating imported approval claims as trusted', () => {
    const source = templateSourceDetails(JSON.stringify(document))!
    expect(source.provider).toBe('Sesimi')
    expect(source.make).toBe('Geely')
    expect(source.sourceUrl).toBe('https://geely-au.sesimi.app/assets/export/abc/')
    expect(source.requiresReview).toBe(true)
    expect(source.formatLabel).toBe('HTML snapshot')
    expect(source).not.toHaveProperty('approvalState')
  })
  it('does not turn arbitrary imported source URLs into clickable portal links', () => {
    const copy = structuredClone(document)
    copy.root.data.props.sourceProvenance.sourceUrl = 'https://evil.example/secret'
    expect(templateSourceDetails(copy)?.sourceUrl).toBeNull()
    copy.root.data.props.sourceProvenance.sourceUrl = 'https://user:password@geely-au.sesimi.app/assets/x'
    expect(templateSourceDetails(copy)?.sourceUrl).toBeNull()
    expect(templateSourceDetails({})).toBeNull()
    expect(templateSourceDetails('invalid')).toBeNull()
  })
  it('exports only the native document, preserves provenance, and round trips through the real import boundary', () => {
    const before = JSON.stringify(document)
    const exported = buildTemplateExport('Geely / launch', document)
    expect(exported.filename).toBe('Geely-launch.json')
    expect(exported.content).not.toContain('token=secret')
    expect(exported.content).not.toContain('approvalState')
    expect(prepareTemplateImport('json', exported.content).root.data.props?.sourceProvenance).toMatchObject({ provider: 'Sesimi', make: 'Geely', sourceUrl: 'https://geely-au.sesimi.app/assets/export/abc/' })
    expect(JSON.stringify(document)).toBe(before)
  })
  it('keeps customised OEM copies out of the original OEM category', () => {
    expect(templateCopyCategory(document, 'Official OEM / Geely')).toBe('Client templates / Geely')
    expect(templateCopyCategory({}, 'Newsletters')).toBe('Newsletters')
  })
  it('rejects malformed and oversized backups rather than downloading files that cannot be imported', () => {
    expect(() => buildTemplateExport('bad', {})).toThrow()
    expect(() => buildTemplateExport('bad', { ...document, body: { type: 'Html', data: { props: { contents: 'a'.repeat(524288) } } } })).toThrow(/512 KB/)
  })
  it('backs up template settings without carrying source client identifiers or approval claims', () => {
    const file = buildTemplateExport('Historical launch', document, { subject: 'Launch subject', preview_text: 'Coming soon', template_kind: 'draft', folder_name: 'Official OEM / Geely' })
    const backup = JSON.parse(file.content)
    expect(backup.format).toBe('xeroflow-email-template')
    expect(backup.template).toMatchObject({ name: 'Historical launch', subject: 'Launch subject', preview_text: 'Coming soon', template_kind: 'draft', folder_name: 'Official OEM / Geely' })
    expect(backup.template).not.toHaveProperty('client_id')
    expect(backup.template).not.toHaveProperty('created_by')
    expect(prepareTemplateImport('json', file.content).root.type).toBe('EmailLayout')
  })
  it('bounds and normalises names when copying an already long or copied template', () => {
    expect(templateCopyName('a'.repeat(200)).length).toBeLessThanOrEqual(200)
    expect(templateCopyName('Copy of Copy of Launch (copy)')).toBe('Launch (copy)')
  })
  it('drops malformed and unknown provenance shapes rather than exporting raw portal material', () => {
    for (const source of ['https://geely-au.sesimi.app/assets/x?token=secret', [{ sourceUrl: 'https://geely-au.sesimi.app/assets/x?token=secret', approvalState: 'approved' }]]) {
      const copy = structuredClone(document) as any
      copy.root.data.props.sourceProvenance = source
      expect(JSON.stringify(redactTemplateProvenance(copy))).not.toContain('token=secret')
    }
    const copy = structuredClone(document) as any
    copy.root.data.props.sourceProvenance.layoutAdaptation = 'token=secret'
    expect(JSON.stringify(redactTemplateProvenance(copy))).not.toContain('token=secret')
  })
})
