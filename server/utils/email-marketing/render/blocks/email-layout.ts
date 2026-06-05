import { registerBlock, renderBlock } from '../block-registry'
import { edmResponsiveClassForBlock, getHideClassForBlock, mobileStyleDeclarationsForBlock } from '~~/app/utils/edmResponsive'
import type { FlyhubBlock, BlockRenderContext } from './types'

function responsiveClassesForChild(id: string, childBlock: FlyhubBlock): string {
  return [
    mobileStyleDeclarationsForBlock(childBlock).length > 0 ? edmResponsiveClassForBlock(id) : '',
    getHideClassForBlock(childBlock) || ''
  ].filter(Boolean).join(' ')
}

function wrapResponsiveHtml(id: string, childBlock: FlyhubBlock, html: string): string {
  const className = responsiveClassesForChild(id, childBlock)
  return className ? `<div class="${className}">${html}</div>` : html
}

export const EMAIL_LAYOUT_BLOCK_TYPE = 'EmailLayout'

registerBlock({
  type: EMAIL_LAYOUT_BLOCK_TYPE,

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
        return wrapResponsiveHtml(id, childBlock, renderBlock(childBlock, 'html', context))
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
