import { registerBlock, renderBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { extendedStyleCss } from '~~/app/utils/edmStyle'

registerBlock({
  type: 'Container',

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''

    const containerBgColor = bgColor || (props.backgroundColor as string) || ''
    const containerBorderColor = style.borderColor || ''
    const containerBorderRadius = style.borderRadius ? `${style.borderRadius}px` : '0'
    const richStyle = extendedStyleCss(style)
    const childrenIds = (data.childrenIds || []) as string[]

    // Resolve and render children via the registry
    const childrenMjml = childrenIds
      .map((id) => {
        const childBlock = context._document?.[id]
        if (!childBlock) return ''
        return renderBlock(childBlock, 'mjml', context)
      })
      .join('\n')

    // Build border style if borderColor is set
    const borderStyle = containerBorderColor && !richStyle.includes('border:')
      ? `border: 1px solid ${containerBorderColor};`
      : ''
    const radiusStyle
      = containerBorderRadius !== '0' && !richStyle.includes('border-radius:')
        ? `border-radius: ${containerBorderRadius};`
        : ''
    const wrapperStyle = [borderStyle, radiusStyle, richStyle, 'overflow: hidden;', `padding: ${padding};`]
      .filter(Boolean)
      .join(' ')

    // Use mj-section with mj-raw for container styling (avoid mj-wrapper nesting issues)
    if (borderStyle || radiusStyle || richStyle) {
      return `
          <mj-section padding="0"${containerBgColor ? ` background-color="${containerBgColor}"` : ''}>
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
      return `
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

    const childrenHtml = childrenIds
      .map((id) => {
        const childBlock = context._document?.[id]
        if (!childBlock) return ''
        return renderBlock(childBlock, 'html', context)
      })
      .join('\n')

    return `
        <tr>
          <td style="${containerBgColor ? `background-color: ${containerBgColor};` : ''}${extendedStyleCss(style)}">
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
