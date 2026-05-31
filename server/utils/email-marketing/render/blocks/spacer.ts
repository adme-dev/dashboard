import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'

registerBlock({
  type: 'Spacer',

  renderMjml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const bgColor = (style.backgroundColor as string) || ''

    const height = (props.height as number) || 24
    return `
        <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-spacer height="${height}px" />
          </mj-column>
        </mj-section>`
  },

  renderMjmlInline(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>

    const height = (props.height as number) || 24
    return `<mj-spacer height="${height}px" />`
  },

  renderHtml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const bgColor = (style.backgroundColor as string) || ''

    const height = (props.height as number) || 24
    return `
        <tr>
          <td style="height: ${height}px; ${bgColor ? `background-color: ${bgColor};` : ''}">&nbsp;</td>
        </tr>`
  },

  defaultProps: {
    height: 24
  }
})
