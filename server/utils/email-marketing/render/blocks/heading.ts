import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { resolveFontFamily, formatPadding } from './types'
import { escapeHtml, escapeFontFamilyForHtml } from './helpers'
import { extendedStyleCss } from '~~/app/utils/edmStyle'

const HEADING_FONT_SIZE_MAP: Record<string, string> = {
  h1: '32px',
  h2: '24px',
  h3: '20px',
  h4: '18px',
  h5: '16px',
  h6: '14px'
}

registerBlock({
  type: 'Heading',

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

    const level = (props.level as string) || 'h2'
    const text = (props.text as string) || ''
    const headingFontSize = fontSize || HEADING_FONT_SIZE_MAP[level] || '24px'

    return `
        <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-text
              padding="${padding}"
              align="${textAlign}"
              color="${textColor || '#111827'}"
              font-size="${headingFontSize}"
              font-family="${fontFamily}"
              font-weight="${fontWeight === 'bold' ? 'bold' : 'bold'}"
              line-height="1.3"
            >${escapeHtml(text)}</mj-text>
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

    const level = (props.level as string) || 'h2'
    const text = (props.text as string) || ''
    const headingFontSize = fontSize || HEADING_FONT_SIZE_MAP[level] || '24px'

    return `<mj-text padding="${padding}" align="${textAlign}" color="${textColor || '#111827'}" font-size="${headingFontSize}" font-family="${fontFamily}" font-weight="bold" line-height="1.3">${escapeHtml(text)}</mj-text>`
  },

  renderHtml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'
    const textColor = (style.color as string) || ''
    const bgColor = (style.backgroundColor as string) || ''
    const fontSize = style.fontSize ? `${style.fontSize}px` : null
    const fontFamily = resolveFontFamily(style.fontFamily, _context.fontFamily)

    const level = (props.level as string) || 'h2'
    const text = (props.text as string) || ''
    const headingFontSize = fontSize || HEADING_FONT_SIZE_MAP[level] || '24px'

    return `
        <tr>
          <td style="padding: ${padding}; text-align: ${textAlign}; ${bgColor ? `background-color: ${bgColor};` : ''}">
            <${level} style="margin: 0; color: ${textColor || '#111827'}; font-size: ${headingFontSize}; font-family: ${escapeFontFamilyForHtml(fontFamily)}; font-weight: bold; line-height: 1.3; ${extendedStyleCss(style)}">
              ${escapeHtml(text)}
            </${level}>
          </td>
        </tr>`
  },

  defaultProps: {
    level: 'h2',
    text: ''
  }
})
