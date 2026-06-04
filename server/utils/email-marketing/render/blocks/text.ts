import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { resolveFontFamily, formatPadding } from './types'
import { escapeFontFamilyForHtml } from './helpers'
import { anchorIdAttribute } from '~~/app/utils/edmAnchor'
import { extendedStyleCss } from '~~/app/utils/edmStyle'

registerBlock({
  type: 'Text',

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'
    const textColor = (style.color as string) || ''
    const bgColor = (style.backgroundColor as string) || ''
    const fontSize = style.fontSize ? `${style.fontSize}px` : null
    const fontFamily = resolveFontFamily(style.fontFamily, context.fontFamily)
    const fontWeight = (style.fontWeight as string) || 'normal'

    const text = (props.text as string) || ''
    const textFontSize = fontSize || '16px'
    return `
        <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
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
    const fontSize = style.fontSize ? `${style.fontSize}px` : null
    const fontFamily = resolveFontFamily(style.fontFamily, context.fontFamily)
    const fontWeight = (style.fontWeight as string) || 'normal'

    const text = (props.text as string) || ''
    const textFontSize = fontSize || '16px'

    return `<mj-text padding="${padding}" align="${textAlign}" color="${textColor || '#374151'}" font-size="${textFontSize}" font-family="${fontFamily}" font-weight="${fontWeight}" line-height="1.6">${text}</mj-text>`
  },

  renderHtml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'
    const textColor = (style.color as string) || ''
    const bgColor = (style.backgroundColor as string) || ''
    const fontSize = style.fontSize ? `${style.fontSize}px` : null
    const fontFamily = resolveFontFamily(style.fontFamily, context.fontFamily)
    const fontWeight = (style.fontWeight as string) || 'normal'

    const text = (props.text as string) || ''
    const textFontSize = fontSize || '16px'
    return `
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; text-align: ${textAlign}; color: ${textColor || '#374151'}; font-size: ${textFontSize}; font-family: ${escapeFontFamilyForHtml(fontFamily)}; font-weight: ${fontWeight}; line-height: 1.6; ${bgColor ? `background-color: ${bgColor};` : ''}${extendedStyleCss(style)}">
            ${text}
          </td>
        </tr>`
  },

  defaultProps: {
    text: ''
  }
})
