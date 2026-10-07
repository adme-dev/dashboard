import { boundedText } from '../boundedText'
import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { resolveFontFamily, formatPadding } from './types'
import { escapeFontFamilyForHtml } from './helpers'
import { anchorIdAttribute } from '../../../../../app/utils/edmAnchor'
import { extendedStyleCss } from '../../../../../app/utils/edmStyle'

export const TEXT_BLOCK_TYPE = 'Text'

registerBlock({
  type: TEXT_BLOCK_TYPE,

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'
    const textColor = (style.color as string) || ''
    const bgColor = (style.backgroundColor as string) || ''
    const fontSize = style.fontSize ? boundedText(context.renderBudget)`${style.fontSize}px` : null
    const fontFamily = resolveFontFamily(style.fontFamily, context.fontFamily)
    const fontWeight = (style.fontWeight as string) || 'normal'

    const text = (props.text as string) || ''
    const textFontSize = fontSize || '16px'
    return boundedText(context.renderBudget)`
        <mj-section padding="0"${bgColor ? boundedText(context.renderBudget)` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-text
              padding="${padding}"
              align="${textAlign}"
              color="${textColor || '#374151'}"
              font-size="${textFontSize}"
              font-family="${fontFamily}"
              font-weight="${fontWeight}"
              line-height="1.6"
            >${text}</mj-text>
          </mj-column>
        </mj-section>`
  },

  renderMjmlInline(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'
    const textColor = (style.color as string) || ''
    const fontSize = style.fontSize ? boundedText(context.renderBudget)`${style.fontSize}px` : null
    const fontFamily = resolveFontFamily(style.fontFamily, context.fontFamily)
    const fontWeight = (style.fontWeight as string) || 'normal'

    const text = (props.text as string) || ''
    const textFontSize = fontSize || '16px'

    return boundedText(context.renderBudget)`<mj-text padding="${padding}" align="${textAlign}" color="${textColor || '#374151'}" font-size="${textFontSize}" font-family="${fontFamily}" font-weight="${fontWeight}" line-height="1.6">${text}</mj-text>`
  },

  renderHtml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'
    const textColor = (style.color as string) || ''
    const bgColor = (style.backgroundColor as string) || ''
    const fontSize = style.fontSize ? boundedText(context.renderBudget)`${style.fontSize}px` : null
    const fontFamily = resolveFontFamily(style.fontFamily, context.fontFamily)
    const fontWeight = (style.fontWeight as string) || 'normal'

    const text = (props.text as string) || ''
    const textFontSize = fontSize || '16px'
    return boundedText(context.renderBudget)`
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; text-align: ${textAlign}; color: ${textColor || '#374151'}; font-size: ${textFontSize}; font-family: ${escapeFontFamilyForHtml(fontFamily)}; font-weight: ${fontWeight}; line-height: 1.6; ${bgColor ? boundedText(context.renderBudget)`background-color: ${bgColor};` : ''}${extendedStyleCss(style)}">
            ${text}
          </td>
        </tr>`
  },

  defaultProps: {
    text: ''
  }
})
