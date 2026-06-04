import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { escapeHtml, escapeUrl } from './helpers'
import { anchorIdAttribute } from '~~/app/utils/edmAnchor'

registerBlock({
  type: 'header',

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor
      = (props.backgroundColor as string) || (style.backgroundColor as string) || '#ffffff'

    const logoUrl = (props.logoUrl as string) || (context.dealerContext?.logo as string) || ''
    const tagline = (props.tagline as string) || (context.dealerContext?.name as string) || ''
    const alignment = (props.alignment as string) || (style.textAlign as string) || 'center'

    const logoMjml = logoUrl
      ? `<mj-image src="${escapeUrl(logoUrl)}" width="180px" alt="Logo" padding="0 0 8px 0" align="${alignment}" />`
      : ''

    const taglineMjml = tagline
      ? `<mj-text align="${alignment}" font-size="14px" color="#6b7280" padding="0">${escapeHtml(tagline)}</mj-text>`
      : ''

    return `
        <mj-section padding="${padding}" background-color="${bgColor}">
          <mj-column>
            ${logoMjml}
            ${taglineMjml}
          </mj-column>
        </mj-section>`
  },

  renderHtml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor
      = (props.backgroundColor as string) || (style.backgroundColor as string) || '#ffffff'

    const logoUrl = (props.logoUrl as string) || (context.dealerContext?.logo as string) || ''
    const tagline = (props.tagline as string) || (context.dealerContext?.name as string) || ''
    const alignment = (props.alignment as string) || (style.textAlign as string) || 'center'

    const logoHtml = logoUrl
      ? `<img src="${escapeUrl(logoUrl)}" alt="Logo" style="max-height:60px;width:auto;display:block;margin:0 auto 8px;" />`
      : ''

    const taglineHtml = tagline
      ? `<span style="font-size:14px;color:#6b7280;">${escapeHtml(tagline)}</span>`
      : ''

    return `
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; text-align: ${alignment}; background-color: ${bgColor};">
            ${logoHtml}
            ${taglineHtml}
          </td>
        </tr>`
  },

  defaultProps: {
    logoUrl: '',
    tagline: '',
    backgroundColor: '#ffffff'
  }
})
