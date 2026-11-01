import { describe, expect, it } from 'vitest'
import {
  validateEmailDesign,
  assertDesignPolicyUnchanged,
  defaultDesignPolicy
} from '../../shared/emailRendering/designContract'
import {
  structuredDesign,
  type MutableDesignFixture
} from '../fixtures/email-design/structured'

describe('email design boundary', () => {
  it('preserves merge fields and returns an independent JSON snapshot', () => {
    const source = structuredDesign()
    const result = validateEmailDesign(source)
    source.blocks.heading.data.props.text = 'changed later'
    expect(result.blocks.heading.data.props!.text).toBe('Hello {{first_name}}')
  })
  it.each([
    [
      'future schema',
      (d: MutableDesignFixture) => {
        d.schemaVersion = 2
      }
    ],
    [
      'dangling root',
      (d: MutableDesignFixture) => {
        d.rootChildrenIds = ['missing']
      }
    ],
    [
      'cycle',
      (d: MutableDesignFixture) => {
        d.blocks.cta.data.childrenIds = ['root']
      }
    ],
    [
      'orphan',
      (d: MutableDesignFixture) => {
        d.blocks.orphan = { type: 'Text', data: {} }
      }
    ],
    [
      'reused child',
      (d: MutableDesignFixture) => {
        d.blocks.root.data.childrenIds.push('cta')
      }
    ],
    [
      'column cycle',
      (d: MutableDesignFixture) => {
        d.blocks.cta.data.props.columns = [{ childrenIds: ['root'] }]
      }
    ],
    [
      'prototype root',
      (d: MutableDesignFixture) => {
        d.rootChildrenIds = ['constructor']
      }
    ],
    [
      'foreign lineage',
      (d: MutableDesignFixture) => {
        d.lineage[0].blockId = 'missing'
      }
    ],
    [
      'duplicate semantic node',
      (d: MutableDesignFixture) => {
        d.lineage[1].nodeId = d.lineage[0].nodeId
      }
    ],
    [
      'unresolved module pin',
      (d: MutableDesignFixture) => {
        d.moduleInstances = [
          {
            instanceId: 'one',
            moduleId: 'module',
            revisionId: 'rev',
            rootBlockIds: ['heading'],
            overrides: {}
          }
        ]
      }
    ],
    [
      'dangling policy field',
      (d: MutableDesignFixture) => {
        d.policy.editableFields = ['missing.data.props.text']
      }
    ],
    [
      'public native artifact',
      (d: MutableDesignFixture) => {
        d.source.nativeArtifact = {
          id: 'native',
          sha256: 'a'.repeat(64),
          url: 'https://example.com/private.figcraft'
        }
      }
    ]
  ])('rejects %s', (_label, mutate) => {
    const input = structuredDesign()
    mutate(input)
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('counts UTF-8 bytes before accepting a module', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.kind = 'module'
    input.blocks = { heading: input.blocks.heading }
    input.rootChildrenIds = ['heading']
    input.lineage = [input.lineage[0]]
    input.policy.editableFields = ['heading.data.props.text']
    input.blocks.heading.data.props.text = '界'.repeat(180_000)
    expect(JSON.stringify(input).length).toBeLessThan(512 * 1024)
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('rejects object cycles before recursive schema parsing', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.blocks.heading.data.props.self = input
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('rejects excessive graph depth even for a small JSON object', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.blocks = {}
    input.lineage = []
    input.policy.editableFields = []
    for (let i = 0; i < 70; i++)
      input.blocks[i ? `n${i}` : 'root'] = {
        type: i ? 'Container' : 'EmailLayout',
        data: { childrenIds: i < 69 ? [`n${i + 1}`] : [] }
      }
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('accepts a standalone module without campaign subject or footer', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.kind = 'module'
    delete input.blocks.root
    input.rootChildrenIds = ['heading', 'cta']
    expect(validateEmailDesign(input).kind).toBe('module')
  })
  it('rejects staff attempts to grant themselves new edit permissions', () => {
    const current = validateEmailDesign(structuredDesign())
    const changed = structuredDesign()
    changed.policy.editableFields.push('root.data.childrenIds')
    expect(() => assertDesignPolicyUnchanged(current, changed)).toThrow()
  })
  it('allows ordinary content changes without changing policy', () => {
    const current = validateEmailDesign(structuredDesign())
    const changed = structuredDesign()
    changed.blocks.heading.data.props.text = 'Updated copy'
    expect(() => assertDesignPolicyUnchanged(current, changed)).not.toThrow()
  })
  it('prevents an instance override from changing another section', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.dependencies = [{ moduleId: 'hero', revisionId: 'v1' }]
    input.moduleInstances = [
      {
        instanceId: 'hero-one',
        moduleId: 'hero',
        revisionId: 'v1',
        rootBlockIds: ['heading'],
        overrides: { 'cta.data.props.text': 'Changed outside module' }
      }
    ]
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('allows an explicit override inside its pinned instance', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.dependencies = [{ moduleId: 'hero', revisionId: 'v1' }]
    input.moduleInstances = [
      {
        instanceId: 'hero-one',
        moduleId: 'hero',
        revisionId: 'v1',
        rootBlockIds: ['heading'],
        overrides: { 'heading.data.props.text': 'Local heading' }
      }
    ]
    expect(
      validateEmailDesign(input).moduleInstances[0].overrides[
        'heading.data.props.text'
      ]
    ).toBe('Local heading')
  })
  it('defaults to content edits without granting layout or brand controls', () => {
    const input = structuredDesign()
    expect(defaultDesignPolicy(input.blocks).editableFields.sort()).toEqual([
      'cta.data.props.text',
      'cta.data.props.url',
      'heading.data.props.text'
    ])
  })

  it('allows image replacement and alt text but leaves crop and dimensions opt-in', () => {
    const blocks = {
      image: {
        type: 'Image',
        data: {
          props: {
            url: 'https://example.com/image.png',
            alt: 'Example',
            linkHref: 'https://example.com',
            width: 600,
            crop: 'cover'
          }
        }
      }
    }
    expect(defaultDesignPolicy(blocks).editableFields.sort()).toEqual([
      'image.data.props.alt',
      'image.data.props.linkHref',
      'image.data.props.url'
    ])
  })

  it('rejects a 33-level tree that the private renderer refuses', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.blocks = {}
    input.lineage = []
    input.policy.editableFields = []
    for (let i = 0; i < 33; i++)
      input.blocks[i ? `n${i}` : 'root'] = {
        type: i ? 'Container' : 'EmailLayout',
        data: { childrenIds: i < 32 ? [`n${i + 1}`] : [] }
      }
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('does not hide blocks beneath a leaf that the renderer never traverses', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.blocks.root.data.childrenIds = ['heading']
    input.blocks.heading.data.childrenIds = ['cta']
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('does not count a fake column reference on a leaf as rendered content', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.blocks.root.data.childrenIds = ['heading']
    input.blocks.heading.data.props.columns = [{ childrenIds: ['cta'] }]
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('bounds empty column slots independently from the block count', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.blocks.heading = {
      type: 'ColumnsContainer',
      data: {
        props: {
          columns: Array.from({ length: 301 }, () => ({ childrenIds: [] }))
        }
      }
    }
    input.lineage = []
    input.policy.editableFields = []
    expect(() => validateEmailDesign(input)).toThrow()
  })

  it.each([['root'], ['heading', 'heading']])(
    'rejects ambiguous module instance roots %j',
    (...roots: string[]) => {
      const input: MutableDesignFixture = structuredDesign()
      input.dependencies = [{ moduleId: 'hero', revisionId: 'v1' }]
      input.moduleInstances = [
        {
          instanceId: 'hero-one',
          moduleId: 'hero',
          revisionId: 'v1',
          rootBlockIds: roots,
          overrides: {}
        }
      ]
      expect(() => validateEmailDesign(input)).toThrow()
    }
  )

  it('rejects conflicting ownership of the same block by two instances', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.dependencies = [{ moduleId: 'hero', revisionId: 'v1' }]
    input.moduleInstances = ['one', 'two'].map(instanceId => ({
      instanceId,
      moduleId: 'hero',
      revisionId: 'v1',
      rootBlockIds: ['heading'],
      overrides: {}
    }))
    expect(() => validateEmailDesign(input)).toThrow()
  })
  it('rejects overlapping roots within an instance', () => {
    const input: MutableDesignFixture = structuredDesign()
    input.blocks.section = {
      type: 'Container',
      data: { childrenIds: ['heading'] }
    }
    input.blocks.root.data.childrenIds = ['section', 'cta']
    input.dependencies = [{ moduleId: 'hero', revisionId: 'v1' }]
    input.moduleInstances = [
      {
        instanceId: 'one',
        moduleId: 'hero',
        revisionId: 'v1',
        rootBlockIds: ['section', 'heading'],
        overrides: {}
      }
    ]
    expect(() => validateEmailDesign(input)).toThrow()
  })
})
