import { boundedText, boundedJoin } from '../boundedText'
import { registerBlock, renderBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { anchorIdAttribute } from '../../../../../app/utils/edmAnchor'
import { extendedStyleCss } from '../../../../../app/utils/edmStyle'

export const CONTAINER_BLOCK_TYPE = 'Container'

registerBlock({
  type: CONTAINER_BLOCK_TYPE,

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''

    const containerBgColor = bgColor || (props.backgroundColor as string) || ''
    const containerBorderColor = style.borderColor || ''
    const containerBorderRadius = style.borderRadius ? boundedText(context.renderBudget)`${style.borderRadius}px` : '0'
    const richStyle = extendedStyleCss(style)
    const childrenIds = (data.childrenIds || []) as string[]

    // Resolve and render children via the registry
    const childrenMjml = boundedJoin(childrenIds
      .map((id) => {
        const childBlock = context._document && Object.hasOwn(context._document, id) ? context._document[id] : undefined
        if (!childBlock) return ''
        return renderBlock(childBlock, 'mjml', context)
      }), '\n', context.renderBudget)

    // Build border style if borderColor is set
    const borderStyle = containerBorderColor && !richStyle.includes('border:')
      ? boundedText(context.renderBudget)`border: 1px solid ${containerBorderColor};`
      : ''
    const radiusStyle
      = containerBorderRadius !== '0' && !richStyle.includes('border-radius:')
        ? boundedText(context.renderBudget)`border-radius: ${containerBorderRadius};`
        : ''
    const wrapperStyle = boundedJoin([borderStyle, radiusStyle, richStyle, 'overflow: hidden;', boundedText(context.renderBudget)`padding: ${padding};`]
      .filter(Boolean), ' ', context.renderBudget)

    // Use mj-section with mj-raw for container styling (avoid mj-wrapper nesting issues)
    if (borderStyle || radiusStyle || richStyle) {
      return boundedText(context.renderBudget)`
          <mj-section padding="0"${containerBgColor ? boundedText(context.renderBudget)` background-color="${containerBgColor}"` : ''}>
            <mj-column>
              <mj-raw>
                <div style="${wrapperStyle}">
              </mj-raw>
            </mj-column>
          </mj-section>
          ${childrenMjml}
          <mj-section padding="0">
            <mj-column>
              <mj-raw>
                </div>
              </mj-raw>
            </mj-column>
          </mj-section>`
    }

    // Simple container without borders - just render children with background
    if (containerBgColor) {
      return boundedText(context.renderBudget)`
          <mj-section padding="${padding}" background-color="${containerBgColor}">
            <mj-column>
              <mj-spacer height="0px" />
            </mj-column>
          </mj-section>
          ${childrenMjml}`
    }

    // No special styling - just render children
    return childrenMjml
  },

  renderHtml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const bgColor = (style.backgroundColor as string) || ''

    const containerBgColor = bgColor || (props.backgroundColor as string) || ''
    const childrenIds = (data.childrenIds || []) as string[]

    const childrenHtml = boundedJoin(childrenIds
      .map((id) => {
        const childBlock = context._document && Object.hasOwn(context._document, id) ? context._document[id] : undefined
        if (!childBlock) return ''
        return renderBlock(childBlock, 'html', context)
      }), '\n', context.renderBudget)

    return boundedText(context.renderBudget)`
        <tr${anchorIdAttribute(props)}>
          <td style="${containerBgColor ? boundedText(context.renderBudget)`background-color: ${containerBgColor};` : ''}${extendedStyleCss(style)}">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              ${childrenHtml}
            </table>
          </td>
        </tr>`
  },

  defaultProps: {
    backgroundColor: ''
  }
})
