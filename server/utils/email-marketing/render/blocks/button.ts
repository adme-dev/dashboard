import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { resolveFontFamily, formatPadding } from './types'
import { escapeHtml, escapeFontFamilyForHtml } from './helpers'
import { anchorIdAttribute } from '~~/app/utils/edmAnchor'
import { extendedStyleCss } from '~~/app/utils/edmStyle'

registerBlock({
  type: 'Button',

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'
    const bgColor = (style.backgroundColor as string) || ''
    const fontSize = style.fontSize ? `${style.fontSize}px` : null
    const fontFamily = resolveFontFamily(style.fontFamily, context.fontFamily)
    const fontWeight = (style.fontWeight as string) || 'normal'
    const richStyle = extendedStyleCss(style)

    const buttonText = (props.text as string) || 'Click here'
    const buttonUrl = (props.url as string) || '#'
    const buttonBgColor = (props.buttonBackgroundColor as string) || context.primaryColor
    const buttonTextColor = (props.buttonTextColor as string) || '#ffffff'
    const buttonStyle = (props.buttonStyle as string) || 'rounded'
    const buttonSize = (props.size as string) || 'medium'
    const fullWidth = (props.fullWidth as boolean) || false
    const borderRadius
      = buttonStyle === 'pill' ? '9999px' : buttonStyle === 'rounded' ? '8px' : '0px'

    // Size-based inner padding
    const innerPaddingMap: Record<string, string> = {
      'x-small': '6px 12px',
      'small': '8px 16px',
      'medium': '12px 24px',
      'large': '16px 32px'
    }
    const innerPadding = innerPaddingMap[buttonSize] || '12px 24px'
    const buttonFontSize = fontSize || '16px'

    if (richStyle) {
      return `
        <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-raw>
              <div style="padding: ${padding}; text-align: ${textAlign || 'center'}; ${bgColor ? `background-color: ${bgColor};` : ''}">
                <a href="${buttonUrl}" style="display: inline-block; padding: ${innerPadding}; background-color: ${buttonBgColor}; color: ${buttonTextColor}; text-decoration: none; font-family: ${escapeFontFamilyForHtml(fontFamily)}; font-weight: ${fontWeight === 'bold' ? 'bold' : '600'}; font-size: ${buttonFontSize}; line-height: 1; border-radius: ${borderRadius}; ${fullWidth ? 'width: 100%; text-align: center;' : ''}${richStyle}">
                  ${escapeHtml(buttonText)}
                </a>
              </div>
            </mj-raw>
          </mj-column>
        </mj-section>`
    }

    return `
        <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-button
              padding="${padding}"
              align="${textAlign || 'center'}"
              href="${buttonUrl}"
              background-color="${buttonBgColor}"
              color="${buttonTextColor}"
              border-radius="${borderRadius}"
              font-family="${fontFamily}"
              font-weight="${fontWeight === 'bold' ? 'bold' : '600'}"
              font-size="${buttonFontSize}"
              inner-padding="${innerPadding}"
              ${fullWidth ? 'width="100%"' : ''}
            >${escapeHtml(buttonText)}</mj-button>
          </mj-column>
        </mj-section>`
  },

  renderMjmlInline(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'
    const fontSize = style.fontSize ? `${style.fontSize}px` : null
    const fontFamily = resolveFontFamily(style.fontFamily, context.fontFamily)
    const fontWeight = (style.fontWeight as string) || 'normal'
    const richStyle = extendedStyleCss(style)

    const buttonText = (props.text as string) || 'Click here'
    const buttonUrl = (props.url as string) || '#'
    const buttonBgColor = (props.buttonBackgroundColor as string) || context.primaryColor
    const buttonTextColor = (props.buttonTextColor as string) || '#ffffff'
    const buttonStyle = (props.buttonStyle as string) || 'rounded'
    const buttonSize = (props.size as string) || 'medium'
    const fullWidth = (props.fullWidth as boolean) || false
    const borderRadius
      = buttonStyle === 'pill' ? '9999px' : buttonStyle === 'rounded' ? '8px' : '0px'
    const innerPaddingMap: Record<string, string> = {
      'x-small': '6px 12px',
      'small': '8px 16px',
      'medium': '12px 24px',
      'large': '16px 32px'
    }
    const innerPadding = innerPaddingMap[buttonSize] || '12px 24px'
    const buttonFontSize = fontSize || '16px'

    if (richStyle) {
      return `
        <mj-raw>
          <div style="padding: ${padding}; text-align: ${textAlign || 'center'};">
            <a href="${buttonUrl}" style="display: inline-block; padding: ${innerPadding}; background-color: ${buttonBgColor}; color: ${buttonTextColor}; text-decoration: none; font-family: ${escapeFontFamilyForHtml(fontFamily)}; font-weight: ${fontWeight === 'bold' ? 'bold' : '600'}; font-size: ${buttonFontSize}; line-height: 1; border-radius: ${borderRadius}; ${fullWidth ? 'width: 100%; text-align: center;' : ''}${richStyle}">
              ${escapeHtml(buttonText)}
            </a>
          </div>
        </mj-raw>`
    }

    return `<mj-button padding="${padding}" align="${textAlign || 'center'}" href="${buttonUrl}" background-color="${buttonBgColor}" color="${buttonTextColor}" border-radius="${borderRadius}" font-family="${fontFamily}" font-weight="${fontWeight === 'bold' ? 'bold' : '600'}" font-size="${buttonFontSize}" inner-padding="${innerPadding}">${escapeHtml(buttonText)}</mj-button>`
  },

  renderHtml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'
    const bgColor = (style.backgroundColor as string) || ''
    const fontSize = style.fontSize ? `${style.fontSize}px` : null
    const fontFamily = resolveFontFamily(style.fontFamily, context.fontFamily)
    const fontWeight = (style.fontWeight as string) || 'normal'

    const buttonText = (props.text as string) || 'Click here'
    const buttonUrl = (props.url as string) || '#'
    const buttonBgColor = (props.buttonBackgroundColor as string) || context.primaryColor
    const buttonTextColor = (props.buttonTextColor as string) || '#ffffff'
    const buttonStyle = (props.buttonStyle as string) || 'rounded'
    const buttonSize = (props.size as string) || 'medium'
    const fullWidth = (props.fullWidth as boolean) || false
    const borderRadius
      = buttonStyle === 'pill' ? '9999px' : buttonStyle === 'rounded' ? '8px' : '0px'

    // MSO padding values for Outlook compatibility
    const msoPaddingMap: Record<string, { pt: string, pb: string }> = {
      'x-small': { pt: '6px', pb: '21px' },
      'small': { pt: '8px', pb: '23px' },
      'medium': { pt: '12px', pb: '27px' },
      'large': { pt: '16px', pb: '31px' }
    }
    const msoPadding = msoPaddingMap[buttonSize] || { pt: '12px', pb: '27px' }
    const innerPaddingMap: Record<string, string> = {
      'x-small': '6px 12px',
      'small': '8px 16px',
      'medium': '12px 24px',
      'large': '16px 32px'
    }
    const innerPadding = innerPaddingMap[buttonSize] || '12px 24px'
    const buttonFontSize = fontSize || '16px'

    // Use MSO padding hack for proper button rendering in Outlook
    return `
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; text-align: ${textAlign || 'center'}; ${bgColor ? `background-color: ${bgColor};` : ''}">
            <a href="${buttonUrl}" style="display: inline-block; padding: ${innerPadding}; background-color: ${buttonBgColor}; color: ${buttonTextColor}; text-decoration: none; font-family: ${escapeFontFamilyForHtml(fontFamily)}; font-weight: ${fontWeight === 'bold' ? 'bold' : '600'}; font-size: ${buttonFontSize}; line-height: 1; border-radius: ${borderRadius}; ${fullWidth ? 'width: 100%; text-align: center;' : ''}${extendedStyleCss(style)}">
              <!--[if mso]><i style="mso-font-width: 150%; mso-text-raise: ${msoPadding.pb};" hidden>&emsp;</i><![endif]-->
              <span style="mso-text-raise: ${msoPadding.pt};">${escapeHtml(buttonText)}</span>
              <!--[if mso]><i style="mso-font-width: 150%;" hidden>&emsp;&#8203;</i><![endif]-->
            </a>
          </td>
        </tr>`
  },

  defaultProps: {
    text: 'Click here',
    url: '#',
    buttonStyle: 'rounded',
    size: 'medium'
  }
})
