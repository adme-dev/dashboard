import { registerBlock, renderBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'

registerBlock({
  type: 'EmailLayout',

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const childrenIds = (data.childrenIds || []) as string[]

    return childrenIds
      .map((id) => {
        const childBlock = context._document?.[id]
        if (!childBlock) return ''
        return renderBlock(childBlock, 'mjml', context)
      })
      .join('\n')
  },

  renderHtml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const childrenIds = (data.childrenIds || []) as string[]

    return childrenIds
      .map((id) => {
        const childBlock = context._document?.[id]
        if (!childBlock) return ''
        return renderBlock(childBlock, 'html', context)
      })
      .join('\n')
  },

  defaultProps: {
    backdropColor: '#F5F5F5',
    canvasColor: '#FFFFFF',
    textColor: '#262626',
    fontFamily: 'MODERN_SANS',
    borderRadius: 0
  }
})
