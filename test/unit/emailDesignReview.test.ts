import { describe, expect, it } from 'vitest'
import {
  validateEmailDesign,
  EmailDesignError
} from '../../shared/emailRendering/designContract'
import { assessDesignCapabilities } from '../../shared/emailRendering/designCapabilities'
import {
  structuredDesign,
  type MutableDesignFixture
} from '../fixtures/email-design/structured'

describe('design review regressions', () => {
  it('rejects send-visible children beyond the composer column count', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.blocks.root.data.childrenIds = ['columns']
    input.blocks.columns = {
      type: 'ColumnsContainer',
      data: {
        props: {
          columnsCount: 2,
          columns: [
            { childrenIds: ['heading'] },
            { childrenIds: [] },
            { childrenIds: ['cta'] }
          ]
        }
      }
    }
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('accepts matching visible and rendered columns', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.blocks.root.data.childrenIds = ['columns']
    input.blocks.columns = {
      type: 'ColumnsContainer',
      data: {
        props: {
          columnsCount: 2,
          columns: [{ childrenIds: ['heading'] }, { childrenIds: ['cta'] }]
        }
      }
    }
    expect(validateEmailDesign(input).blocks.cta.data.props!.text).toBe(
      'View offer'
    )
  })
  it('reports a native block without edit grants as design-only', () => {
    const report = assessDesignCapabilities(structuredDesign())
    expect(
      report.blocks.find(block => block.blockId === 'root')?.disposition
    ).toBe('design-only')
  })
  it('rejects whole-object edit grants', () => {
    const input = structuredDesign()
    input.policy.editableFields = ['cta.data.props']
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('rejects changing a string override into an object', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.dependencies = [{ moduleId: 'hero', revisionId: 'v1' }]
    input.moduleInstances = [
      {
        instanceId: 'one',
        moduleId: 'hero',
        revisionId: 'v1',
        rootBlockIds: ['heading'],
        overrides: { 'heading.data.props.text': { not: 'text' } }
      }
    ]
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('rejects a client ID that cannot be stored in the existing UUID scope', () => {
    const input = structuredDesign()
    input.scope.clientId = 'not-a-uuid'
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('requires campaign drafts to name a client', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.kind = 'campaign-draft'
    input.scope.clientId = null
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it.each(['schema', 'cycle', 'overflow'])(
    'uses a stable public error for %s failures',
    (kind) => {
      const input: MutableDesignFixture = structuredDesign()
      if (kind === 'schema') input.schemaVersion = 9
      if (kind === 'cycle') input.blocks.heading.data.props.self = input
      if (kind === 'overflow')
        input.blocks.heading.data.props.text = 'x'.repeat(3 * 1024 * 1024)
      expect(() => validateEmailDesign(input)).toThrow(EmailDesignError)
    }
  )
  it('does not grant structural child references as scalar content fields', () => {
    const input = structuredDesign()
    input.policy.editableFields = ['root.data.childrenIds.0']
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('rejects WebP in the email delivery manifest pending conversion', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.assets = [
      {
        id: 'image',
        sha256: 'a'.repeat(64),
        mimeType: 'image/webp',
        bytes: 1000,
        width: 100,
        height: 100
      }
    ]
    expect(() => validateEmailDesign(input)).toThrow()
  })
})
