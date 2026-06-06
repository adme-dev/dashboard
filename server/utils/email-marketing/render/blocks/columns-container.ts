import { registerBlock, renderBlock, getBlockDefinition } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { anchorIdAttribute } from '~~/app/utils/edmAnchor'
import { extendedStyleCss } from '~~/app/utils/edmStyle'

/**
 * Render a child block within an MJML column (without wrapping section).
 * Uses renderMjmlInline from the block registry when available, falling back
 * to stripping mj-section/mj-column wrappers from renderMjml output.
 */
function renderColumnChildToMjml(block: FlyhubBlock, context: BlockRenderContext): string {
  const definition = getBlockDefinition(block.type)
  if (!definition) {
    return `<mj-text padding="8px" color="#6b7280">[${block.type}]</mj-text>`
  }
  // Use renderMjmlInline if available (no mj-section wrapper)
  if (definition.renderMjmlInline) {
    return definition.renderMjmlInline(block, context)
  }
  // Fallback: use renderMjml and strip the mj-section/mj-column wrapper
  const mjml = definition.renderMjml(block, context)
  const match = mjml.match(
    /<mj-section[^>]*>\s*<mj-column[^>]*>([\s\S]*?)<\/mj-column>\s*<\/mj-section>/
  )
  if (match?.[1]) return match[1].trim()
  return mjml
}

export const COLUMNS_CONTAINER_BLOCK_TYPE = 'ColumnsContainer'

registerBlock({
  type: COLUMNS_CONTAINER_BLOCK_TYPE,

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''

    const columns = (props.columns as Array<{ childrenIds: string[] }>) || []
    const columnsCount = columns.length || 2
    const columnsGap = (props.columnsGap as number) || 16
    const contentAlignment = (props.contentAlignment as string) || 'top'
    const fixedWidths = (props.fixedWidths as Array<number | null>) || []

    const columnsMjml = columns
      .map((col, index) => {
        const colChildrenMjml = (col.childrenIds || [])
          .map((id) => {
            const childBlock = context._document?.[id]
            if (!childBlock) return ''
            // For column children, render inline without wrapping section
            return renderColumnChildToMjml(childBlock, context)
          })
          .join('\n')

        // Calculate column width - use fixed width if set, otherwise split evenly
        const fixedWidth = fixedWidths[index]
        const columnWidth = fixedWidth ? `${fixedWidth}px` : `${Math.floor(100 / columnsCount)}%`
        const verticalAlign
          = contentAlignment === 'middle'
            ? 'middle'
            : contentAlignment === 'bottom'
              ? 'bottom'
              : 'top'

        // Use percentage width for desktop, MJML handles mobile stacking via mj-breakpoint
        return `
          <mj-column width="${columnWidth}" vertical-align="${verticalAlign}" padding="${Math.floor(columnsGap / 2)}px">
            ${colChildrenMjml || '<mj-spacer height="40px" />'}
          </mj-column>`
      })
      .join('\n')

    // mj-section with direction="ltr" ensures proper stacking order on mobile
    return `
        <mj-section padding="${padding}"${bgColor ? ` background-color="${bgColor}"` : ''} direction="ltr">
          ${columnsMjml}
        </mj-section>`
  },

  renderHtml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''

    const columns = (props.columns as Array<{ childrenIds: string[] }>) || []
    const columnsCount = columns.length || 2
    const columnsGap = (props.columnsGap as number) || 16
    const fixedWidths = (props.fixedWidths as Array<number | null>) || []

    const columnCells = columns
      .map((col, index) => {
        const colChildrenHtml = (col.childrenIds || [])
          .map((id) => {
            const childBlock = context._document?.[id]
            if (!childBlock) return ''
            return renderBlock(childBlock, 'html', context)
          })
          .join('\n')

        const fixedWidth = fixedWidths[index]
        const columnWidth = fixedWidth ? `${fixedWidth}px` : `${Math.floor(100 / columnsCount)}%`

        // Use class="stack-column" for mobile stacking
        return `
          <td class="stack-column" style="width: ${columnWidth}; vertical-align: top; padding: 0 ${columnsGap / 2}px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              ${colChildrenHtml || '<tr><td style="min-height: 40px;">&nbsp;</td></tr>'}
            </table>
          </td>`
      })
      .join('\n')

    return `
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; ${bgColor ? `background-color: ${bgColor};` : ''}${extendedStyleCss(style)}">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr class="columns-row">
                ${columnCells}
              </tr>
            </table>
          </td>
        </tr>`
  },

  defaultProps: {
    columns: [],
    columnsGap: 16,
    contentAlignment: 'top'
  }
})
