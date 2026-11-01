/** Synthetic data only; semantic block shapes match the existing composer. */
export function structuredDesign() {
  return {
    schemaVersion: 1,
    kind: 'template',
    scope: { clientId: '10000000-0000-4000-8000-000000000001' },
    source: { editor: 'composer', nativeArtifact: null },
    blocks: {
      root: { type: 'EmailLayout', data: { childrenIds: ['heading', 'cta'] } },
      heading: {
        type: 'Heading',
        data: { props: { text: 'Hello {{first_name}}' } }
      },
      cta: {
        type: 'Button',
        data: {
          props: { text: 'View offer', url: 'https://example.com/offer' }
        }
      }
    },
    rootChildrenIds: ['root'],
    lineage: [
      {
        blockId: 'heading',
        nodeId: 'node-heading',
        fields: { text: 'field-heading-text' }
      },
      {
        blockId: 'cta',
        nodeId: 'node-cta',
        fields: { text: 'field-cta-text', url: 'field-cta-url' }
      }
    ],
    moduleInstances: [],
    dependencies: [],
    assets: [],
    policy: {
      version: 1,
      editableFields: [
        'heading.data.props.text',
        'cta.data.props.text',
        'cta.data.props.url'
      ]
    }
  }
}

/** Mutable test input permits deliberately invalid versions and field values. */
export interface MutableDesignFixture {
  schemaVersion: number
  kind: string
  scope: { clientId: string | null }
  source: { editor: string, nativeArtifact: unknown }
  blocks: Record<
    string,
    {
      type: string
      data: {
        childrenIds?: string[]
        props?: Record<string, unknown>
        style?: Record<string, unknown>
      }
    }
  >
  rootChildrenIds: string[]
  lineage: Array<{
    blockId: string
    nodeId: string
    fields: Record<string, string>
  }>
  dependencies: Array<{ moduleId: string, revisionId: string }>
  moduleInstances: Array<{
    instanceId: string
    moduleId: string
    revisionId: string
    rootBlockIds: string[]
    overrides: Record<string, unknown>
  }>
  assets: Array<Record<string, unknown>>
  policy: { version: number, editableFields: string[] }
}
