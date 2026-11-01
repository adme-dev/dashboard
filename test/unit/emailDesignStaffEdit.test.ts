import { describe, expect, it } from 'vitest'
import {
  assertStaffDesignEdit,
  validateEmailDesign
} from '../../shared/emailRendering/designContract'
import {
  structuredDesign,
  type MutableDesignFixture
} from '../fixtures/email-design/structured'

describe('staff design mutation boundary', () => {
  it('accepts edits to granted content fields', () => {
    const input = structuredDesign()
    input.blocks.heading.data.props.text = 'Staff copy'
    expect(() =>
      assertStaffDesignEdit(validateEmailDesign(structuredDesign()), input)
    ).not.toThrow()
  })
  it.each([
    [
      'scope',
      (d: MutableDesignFixture) => {
        d.scope.clientId = '20000000-0000-4000-8000-000000000002'
      }
    ],
    [
      'layout',
      (d: MutableDesignFixture) => {
        d.blocks.root.data.childrenIds.reverse()
      }
    ],
    [
      'field type',
      (d: MutableDesignFixture) => {
        d.blocks.heading.data.props.text = 42
      }
    ],
    [
      'brand style',
      (d: MutableDesignFixture) => {
        d.blocks.heading.data.style = { color: '#ff0000' }
      }
    ],
    [
      'native artifact',
      (d: MutableDesignFixture) => {
        d.source.nativeArtifact = { id: 'other', sha256: 'a'.repeat(64) }
      }
    ],
    [
      'lineage',
      (d: MutableDesignFixture) => {
        d.lineage[0].nodeId = 'different-node'
      }
    ],
    [
      'instance metadata',
      (d: MutableDesignFixture) => {
        d.dependencies = [{ moduleId: 'hero', revisionId: 'v1' }]
        d.moduleInstances = [
          {
            instanceId: 'one',
            moduleId: 'hero',
            revisionId: 'v1',
            rootBlockIds: ['heading'],
            overrides: { 'heading.data.props.text': 'injected' }
          }
        ]
      }
    ]
  ])('rejects changing %s through a content save', (_name, mutate) => {
    const input = structuredDesign()
    mutate(input)
    expect(() =>
      assertStaffDesignEdit(validateEmailDesign(structuredDesign()), input)
    ).toThrow()
  })
  it('ignores JSON object key ordering', () => {
    const current = structuredDesign()
    const input = {
      ...current,
      blocks: {
        cta: current.blocks.cta,
        root: current.blocks.root,
        heading: current.blocks.heading
      }
    }
    expect(() =>
      assertStaffDesignEdit(validateEmailDesign(current), input)
    ).not.toThrow()
  })
})
