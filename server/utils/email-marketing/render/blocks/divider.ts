import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'

registerBlock({
  type: 'Divider',

  renderMjml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''

    const lineColor = (props.lineColor as string) || '#e5e7eb'
    const lineHeight = (props.lineHeight as number) || 1

    return `
        <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-divider
              padding="${padding}"
              border-color="${lineColor}"
              border-width="${lineHeight}px"
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
    const lineHeight = (props.lineHeight as number) || 1

    return `<mj-divider padding="${padding}" border-color="${lineColor}" border-width="${lineHeight}px" />`
  },

  renderHtml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''

    const lineColor = (props.lineColor as string) || '#e5e7eb'
    const lineHeight = (props.lineHeight as number) || 1

    return `
        <tr>
          <td style="padding: ${padding}; ${bgColor ? `background-color: ${bgColor};` : ''}">
            <hr style="border: none; border-top: ${lineHeight}px solid ${lineColor}; margin: 0;" />
          </td>
        </tr>`
  },

  defaultProps: {
    lineColor: '#e5e7eb',
    lineHeight: 1
  }
})
