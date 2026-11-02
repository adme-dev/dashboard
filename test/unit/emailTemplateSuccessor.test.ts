import { describe, expect, it } from 'vitest'
import { parseDesignTemplateRequest } from '../../shared/emailRendering/designTemplates'
import { designDigest } from '../../shared/emailRendering/designModules'

const id = '10000000-0000-4000-8000-000000000001'
const revise = { version: 1, command: 'revise-template', operationId: id, draftId: id, expectedRevisionId: id,
  templateId: id, expectedTemplateRevisionId: id, name: 'Published successor', category: null, includedOverridePaths: [] }
describe('same-template successor publication contract', () => {
  it('accepts only explicit saved source and existing target identities plus reviewed publication metadata', () => {
    expect(parseDesignTemplateRequest(revise)).toEqual(revise)
  })
  it('refuses missing CAS/source/review fields and browser canonical, scope or role authority', () => {
    for (const key of ['draftId', 'expectedRevisionId', 'templateId', 'expectedTemplateRevisionId', 'includedOverridePaths']) {
      const value = { ...revise }
      Reflect.deleteProperty(value, key)
      expect(() => parseDesignTemplateRequest(value), key).toThrow()
    }
    for (const extra of [{ source: {} }, { body_html: '<p>forged</p>' }, { clientId: id }, { publisher: true }, { subject: 'browser metadata' }])
      expect(() => parseDesignTemplateRequest({ ...revise, ...extra })).toThrow()
  })
  it('retains old publish/copy strict request shapes and digest recipes without defaults', async () => {
    const publish = { version: 1, command: 'publish-template', operationId: id, draftId: id, expectedRevisionId: id, name: 'Old publish', category: null, includedOverridePaths: [] }
    const copy = { version: 1, command: 'copy-template-draft', operationId: id, templateId: id, revisionId: id, expectedSourceHeadRevisionId: id, clientId: null, name: 'Old copy', category: null }
    expect(parseDesignTemplateRequest(publish)).toEqual(publish)
    expect(parseDesignTemplateRequest(copy)).toEqual(copy)
    expect(await designDigest({ boundary: 'email-template-library-v1', request: parseDesignTemplateRequest(publish) })).toBe('7940c088de65deb8975b875f9a552c3f754587d0229d34534c0e904df55a43c4')
    expect(await designDigest({ boundary: 'email-template-library-v1', request: parseDesignTemplateRequest(copy) })).toBe('23a6904424024376476a730683943f815cf01ec2ca31569028aaa6686d63213c')
  })
})
