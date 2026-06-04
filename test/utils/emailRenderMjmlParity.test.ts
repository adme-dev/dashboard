import { describe, expect, it } from 'vitest'
import { renderBlock } from '~~/server/utils/email-marketing/render/block-registry'
import { BLOCKS_LOADED } from '~~/server/utils/email-marketing/render/blocks'
import type { BlockRenderContext, FlyhubBlock } from '~~/server/utils/email-marketing/render/blocks/types'

void BLOCKS_LOADED

const context: BlockRenderContext = {
  primaryColor: '#2f4574',
  fontFamily: 'Arial, sans-serif',
  _document: {}
}

function block(type: string, props: Record<string, unknown>, style: Record<string, unknown>): FlyhubBlock {
  return {
    type,
    data: {
      props,
      style,
      childrenIds: []
    }
  }
}

describe('MJML preview rich style parity', () => {
  it('renders Container rich border settings with the shared CSS helper', () => {
    const mjml = renderBlock(block('Container', {}, {
      borderWidth: 3,
      borderStyle: 'dashed',
      borderColor: '#aa0000',
      borderRadius: 12
    }), 'mjml', context)

    expect(mjml).toContain('border: 3px dashed #aa0000;')
    expect(mjml).toContain('border-radius: 12px;')
    expect(mjml).not.toContain('border: 1px solid #aa0000;')
  })

  it('renders Avatar rich border settings around the preview avatar', () => {
    const mjml = renderBlock(block('Avatar', { src: 'https://cdn.example.com/a.png', shape: 'circle' }, {
      borderWidth: 2,
      borderStyle: 'solid',
      borderColor: '#00aa66',
      borderRadius: 10
    }), 'mjml', context)

    expect(mjml).toContain('border: 2px solid #00aa66;')
    expect(mjml).toContain('border-radius: 10px;')
  })

  it('renders Button rich border settings after the button shape defaults', () => {
    const mjml = renderBlock(block('Button', { text: 'Go', url: 'https://example.com', buttonStyle: 'rounded' }, {
      borderWidth: 2,
      borderStyle: 'solid',
      borderColor: '#112233',
      borderRadius: 16
    }), 'mjml', context)

    expect(mjml).toContain('border: 2px solid #112233;')
    expect(mjml).toContain('border-radius: 16px;')
  })
})
