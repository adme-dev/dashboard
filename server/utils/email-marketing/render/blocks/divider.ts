import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { anchorIdAttribute } from '~~/app/utils/edmAnchor'
import { dividerLineThickness } from '~~/app/utils/edmDivider'
import { extendedStyleCss } from '~~/app/utils/edmStyle'

export const DIVIDER_BLOCK_TYPE = 'Divider'

registerBlock({
  type: DIVIDER_BLOCK_TYPE,

  renderMjml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''

    const lineColor = (props.lineColor as string) || '#e5e7eb'
    const lineThickness = dividerLineThickness(props)

    return `
        <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-divider
              padding="${padding}"
              border-color="${lineColor}"
              border-width="${lineThickness}px"
            />
          </mj-column>
        </mj-section>`
  },

  renderMjmlInline(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)

    const lineColor = (props.lineColor as string) || '#e5e7eb'
    const lineThickness = dividerLineThickness(props)

    return `<mj-divider padding="${padding}" border-color="${lineColor}" border-width="${lineThickness}px" />`
  },

  renderHtml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''

    const lineColor = (props.lineColor as string) || '#e5e7eb'
    const lineThickness = dividerLineThickness(props)

    return `
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; ${bgColor ? `background-color: ${bgColor};` : ''}${extendedStyleCss(style)}">
            <hr style="border: none; border-top: ${lineThickness}px solid ${lineColor}; margin: 0;" />
          </td>
        </tr>`
  },

  defaultProps: {
    lineColor: '#e5e7eb',
    lineThickness: 1
  }
})
