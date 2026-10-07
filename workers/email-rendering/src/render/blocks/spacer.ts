import { boundedText } from '../boundedText'
import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { anchorIdAttribute } from '../../../../../app/utils/edmAnchor'

export const SPACER_BLOCK_TYPE = 'Spacer'

registerBlock({
  type: SPACER_BLOCK_TYPE,

  renderMjml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const bgColor = (style.backgroundColor as string) || ''

    const height = (props.height as number) || 24
    return boundedText(_context.renderBudget)`
        <mj-section padding="0"${bgColor ? boundedText(_context.renderBudget)` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-spacer height="${height}px" />
          </mj-column>
        </mj-section>`
  },

  renderMjmlInline(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>

    const height = (props.height as number) || 24
    return boundedText(_context.renderBudget)`<mj-spacer height="${height}px" />`
  },

  renderHtml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const bgColor = (style.backgroundColor as string) || ''

    const height = (props.height as number) || 24
    return boundedText(_context.renderBudget)`
        <tr${anchorIdAttribute(props)}>
          <td style="height: ${height}px; ${bgColor ? boundedText(_context.renderBudget)`background-color: ${bgColor};` : ''}">&nbsp;</td>
        </tr>`
  },

  defaultProps: {
    height: 24
  }
})
