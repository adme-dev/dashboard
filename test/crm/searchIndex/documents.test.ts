import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CRM_SEARCH_CANONICAL_MAX_CODE_POINTS,
  CRM_SEARCH_MAX_INPUT_TOKENS,
  type CrmSearchEntityType,
  type CrmSearchExactTokenizer
} from '~~/server/utils/crm/searchIndex/contracts'
import {
  CRM_SEARCH_INDEXED_METADATA_FIELDS,
  CRM_SEARCH_PROVIDER_METADATA_FIELDS,
  CRM_SEARCH_V1_FIELDS,
  buildCrmSearchDocument,
  buildCrmSearchProviderMetadata,
  normalizeCrmSearchDocumentField
} from '~~/server/utils/crm/searchIndex/documents'

const fixture = JSON.parse(readFileSync(
  new URL('../../fixtures/crm-search-documents.json', import.meta.url),
  'utf8'
)) as {
  schemaVersion: string
  normalizationRevision: string
  documents: Array<{
    case: string
    entityType: CrmSearchEntityType
    source: Record<string, unknown>
    expectedCanonicalText: string
    expectedContentHash: string
  }>
}

const tokenizerRevision = 'test-wordpiece-fixture-sha256:0123456789abcdef'

function exactCodePointTokenizer(revision = tokenizerRevision): CrmSearchExactTokenizer {
  return {
    revision,
    encode(text, options) {
      const contentTokens = [...text].map((_, index) => index + 1000)
      return options.addSpecialTokens ? [101, ...contentTokens, 102] : contentTokens
    }
  }
}

describe('CRM search v1 documents', () => {
  it('pins the exact per-entity source-field allowlist and metadata routing contract', () => {
    expect(CRM_SEARCH_V1_FIELDS).toEqual({
      person: ['first_name', 'last_name', 'job_title', 'department', 'lifecycle_stage'],
      company: ['name', 'domain', 'lifecycle_stage'],
      opportunity: ['name', 'status', 'source']
    })
    expect(CRM_SEARCH_PROVIDER_METADATA_FIELDS).toEqual([
      'entityType',
      'schemaVersion',
      'sourceRevision',
      'confirmationTag',
      'confirmationKeyVersion'
    ])
    expect(CRM_SEARCH_INDEXED_METADATA_FIELDS).toEqual(['entityType', 'schemaVersion'])
    expect(Object.isFrozen(CRM_SEARCH_V1_FIELDS)).toBe(true)
    expect(Object.values(CRM_SEARCH_V1_FIELDS).every(Object.isFrozen)).toBe(true)
  })

  it.each(fixture.documents)('$case', async ({ entityType, source, expectedCanonicalText, expectedContentHash }) => {
    const document = await buildCrmSearchDocument({ entityType, source }, {
      tokenizer: exactCodePointTokenizer(),
      expectedTokenizerRevision: tokenizerRevision
    })

    expect(document.canonicalText).toBe(expectedCanonicalText)
    expect(document.contentHash).toBe(expectedContentHash)
    expect(document.providerInput).toBe(expectedCanonicalText)
    expect(document.providerTokenCount).toBe([...expectedCanonicalText].length + 2)
    expect(document.tokenizerRevision).toBe(tokenizerRevision)
    expect(JSON.stringify(document)).not.toMatch(/notes-secret|@example|\+61|03 9000/)
  })

  it('normalizes NFKC, preserves whitespace boundaries, strips C0/C1 and bidi controls, and bounds by code point', () => {
    const normalized = normalizeCrmSearchDocumentField(
      '\u0000  Ａ\tB\u0085C\u202e\u2066  😀😀😀  ',
      7
    )

    expect(normalized).toBe('A B C 😀')
    expect([...normalized]).toHaveLength(7)
  })

  it('applies per-field bounds before the canonical 1,000-code-point cap', async () => {
    const document = await buildCrmSearchDocument({
      entityType: 'person',
      source: {
        first_name: '😀'.repeat(250),
        last_name: 'L'.repeat(250),
        job_title: 'J'.repeat(200),
        department: 'D'.repeat(200),
        lifecycle_stage: 'S'.repeat(200),
        notes: 'must-not-appear'
      }
    }, {
      tokenizer: {
        revision: tokenizerRevision,
        encode(text, options) {
          const count = options.addSpecialTokens ? 2 : 0
          return Array.from({ length: Math.ceil([...text].length / 4) + count }, (_, index) => index)
        }
      },
      expectedTokenizerRevision: tokenizerRevision
    })

    expect(document.canonicalText.split('\n')).toEqual([
      `First name: ${'😀'.repeat(200)}`,
      `Last name: ${'L'.repeat(200)}`,
      `Job title: ${'J'.repeat(160)}`,
      `Department: ${'D'.repeat(160)}`,
      `Lifecycle stage: ${'S'.repeat(160)}`
    ])
    expect([...document.canonicalText].length).toBeLessThanOrEqual(CRM_SEARCH_CANONICAL_MAX_CODE_POINTS)
    expect(document.canonicalText).not.toContain('must-not-appear')
  })

  it('reapplies the domain bound after Unicode lowercase expansion', async () => {
    const document = await buildCrmSearchDocument({
      entityType: 'company',
      source: { domain: '\u0130'.repeat(253) }
    }, {
      tokenizer: exactCodePointTokenizer(),
      expectedTokenizerRevision: tokenizerRevision
    })

    const domain = document.canonicalText.slice('Domain: '.length)
    expect([...domain]).toHaveLength(253)
    expect(domain).toBe(domain.toLowerCase())
  })

  it('truncates deterministically by field priority to 512 exact tokens including special tokens', async () => {
    const source = {
      name: 'N'.repeat(300),
      status: 'S'.repeat(160),
      source: 'Z'.repeat(145) + '-LOWER-PRIORITY'
    }
    const first = await buildCrmSearchDocument({ entityType: 'opportunity', source }, {
      tokenizer: exactCodePointTokenizer(),
      expectedTokenizerRevision: tokenizerRevision
    })
    const second = await buildCrmSearchDocument({ entityType: 'opportunity', source }, {
      tokenizer: exactCodePointTokenizer(),
      expectedTokenizerRevision: tokenizerRevision
    })

    expect(first.providerInput).toBe(second.providerInput)
    expect(first.providerTokenCount).toBe(CRM_SEARCH_MAX_INPUT_TOKENS)
    expect(first.providerInput).toContain(`Name: ${'N'.repeat(300)}`)
    expect(first.providerInput).toContain(`Status: ${'S'.repeat(160)}`)
    expect(first.providerInput).not.toContain('LOWER-PRIORITY')
    expect(first.canonicalText).toContain('LOWER-PRIORITY')
  })

  it('requires an explicitly injected exact tokenizer pinned to the expected schema revision', async () => {
    const source = { entityType: 'person' as const, source: { first_name: 'Alex' } }

    await expect(buildCrmSearchDocument(source, undefined as never))
      .rejects.toThrow(/exact .*tokenizer/i)
    await expect(buildCrmSearchDocument(source, {
      tokenizer: exactCodePointTokenizer('different-tokenizer-revision'),
      expectedTokenizerRevision: tokenizerRevision
    })).rejects.toThrow(/tokenizer revision/i)
    await expect(buildCrmSearchDocument(source, {
      tokenizer: {
        revision: tokenizerRevision,
        encode: () => [101, -1, 102]
      },
      expectedTokenizerRevision: tokenizerRevision
    })).rejects.toThrow(/tokenizer output/i)
    await expect(buildCrmSearchDocument(source, {
      tokenizer: {
        revision: tokenizerRevision,
        encode: () => []
      },
      expectedTokenizerRevision: tokenizerRevision
    })).rejects.toThrow(/tokenizer output/i)
  })

  it('fails closed instead of embedding an empty or malformed approved projection', async () => {
    await expect(buildCrmSearchDocument({
      entityType: 'company',
      source: { name: ' ', domain: null, lifecycle_stage: undefined }
    }, {
      tokenizer: exactCodePointTokenizer(),
      expectedTokenizerRevision: tokenizerRevision
    })).rejects.toThrow(/empty/i)

    await expect(buildCrmSearchDocument({
      entityType: 'company',
      source: { name: { unsafe: true } }
    }, {
      tokenizer: exactCodePointTokenizer(),
      expectedTokenizerRevision: tokenizerRevision
    })).rejects.toThrow(/approved field/i)
  })

  it('creates only routing and keyed-confirmation metadata and rejects extra source-text fields', () => {
    const metadata = buildCrmSearchProviderMetadata({
      entityType: 'person',
      schemaVersion: fixture.schemaVersion,
      sourceRevision: 4,
      confirmationTag: `hmac-sha256:${'a'.repeat(64)}`,
      confirmationKeyVersion: 'k1'
    })

    expect(metadata).toEqual({
      entityType: 'person',
      schemaVersion: 'crm-search-v1',
      sourceRevision: 4,
      confirmationTag: `hmac-sha256:${'a'.repeat(64)}`,
      confirmationKeyVersion: 'k1'
    })
    expect(Object.keys(metadata)).toEqual(CRM_SEARCH_PROVIDER_METADATA_FIELDS)

    expect(() => buildCrmSearchProviderMetadata({
      entityType: 'person',
      schemaVersion: fixture.schemaVersion,
      sourceRevision: 4,
      confirmationTag: `hmac-sha256:${'a'.repeat(64)}`,
      confirmationKeyVersion: 'k1',
      title: 'private source text'
    } as never)).toThrow(/metadata field/i)
  })
})
