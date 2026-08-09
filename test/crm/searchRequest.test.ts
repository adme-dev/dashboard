import { describe, expect, it } from 'vitest'
import {
  CRM_SEARCH_PRIVACY_CLASSIFIER_VERSION,
  CRM_SEARCH_TOKEN_ADMISSION_VERSION,
  classifyCrmSearchPrivacy,
  normalizeCrmSearchRequest
} from '~~/server/utils/crm/searchRequest'

describe('normalizeCrmSearchRequest', () => {
  it('normalizes NFKC, bidi/control characters, whitespace, and the final limit', () => {
    expect(normalizeCrmSearchRequest({ query: '  Ａcme\u202e  ', limit: 500 })).toEqual({
      query: 'Acme',
      limit: 50,
      semanticEligible: true
    })
    expect(normalizeCrmSearchRequest({ query: '  Ａc\u0000me\u202e \t Pty  ', limit: 0 })).toEqual({
      query: 'Acme Pty',
      limit: 1,
      semanticEligible: true
    })
  })

  it('validates a strict JSON shape without coercing caller values', () => {
    expect(() => normalizeCrmSearchRequest({ query: 'Acme', extra: true })).toThrow()
    expect(() => normalizeCrmSearchRequest({ query: 'Acme', limit: '20' })).toThrow()
    expect(() => normalizeCrmSearchRequest({ query: 'Acme', clientId: 'not-a-uuid' })).toThrow()
    expect(normalizeCrmSearchRequest({
      clientId: '11111111-1111-4111-8111-111111111111',
      query: 'Acme'
    })).toMatchObject({ clientId: '11111111-1111-4111-8111-111111111111' })
  })

  it('rejects blank and post-normalization input above 256 Unicode code points', () => {
    expect(() => normalizeCrmSearchRequest({ query: '\u202e\u0000  ' })).toThrow()
    expect(() => normalizeCrmSearchRequest({ query: 'Ａ'.repeat(257) })).toThrow()
    expect(normalizeCrmSearchRequest({ query: '🚀'.repeat(200) }).query).toHaveLength(400)
  })

  it.each([
    ['full-width email', 'ｕｓｅｒ＠ｅｘａｍｐｌｅ．ｃｏｍ'],
    ['mixed-script email', 'uѕer@example.com'],
    ['full-width and mixed-script phone', '+６１ ٤١٢ ٣٤٥ ٦٧٨'],
    ['obfuscated UUID', '１２３e４５６７-e８９b-１２d３-a４５６-４２６６１４１７４０００'],
    ['high-entropy identifier', 'AKIAIOSFODNN7EXAMPLEabc123']
  ])('keeps %s keyword-only after normalization', (_label, query) => {
    const result = normalizeCrmSearchRequest({ query })
    expect(result.query).toBeTruthy()
    expect(result.semanticEligible).toBe(false)
  })

  it('keeps a query above the conservative 512-token admission bound keyword-only', () => {
    expect(normalizeCrmSearchRequest({ query: '🧬'.repeat(127) }).semanticEligible).toBe(true)
    const result = normalizeCrmSearchRequest({ query: '🧬'.repeat(128) })
    expect(result.semanticEligible).toBe(false)
  })

  it('accepts a versioned exact-tokenizer seam and fails closed above its budget', () => {
    expect(normalizeCrmSearchRequest({ query: 'Acme' }, {
      tokenAdmission: {
        version: 'fixture-exact-tokenizer-v1',
        countTokens: () => 513
      }
    }).semanticEligible).toBe(false)
  })

  it('exposes a versioned classifier and tokenizer decision contract', () => {
    expect(CRM_SEARCH_PRIVACY_CLASSIFIER_VERSION).toBe('crm-search-privacy-v1')
    expect(CRM_SEARCH_TOKEN_ADMISSION_VERSION).toBe('bge-base-en-v1.5-conservative-utf8-v1')
    expect(classifyCrmSearchPrivacy('Acme account')).toEqual({
      version: 'crm-search-privacy-v1',
      semanticEligible: true,
      reason: 'eligible'
    })
  })
})
