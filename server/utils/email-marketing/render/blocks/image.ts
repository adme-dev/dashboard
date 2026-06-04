import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { escapeHtml } from './helpers'
import { anchorIdAttribute } from '~~/app/utils/edmAnchor'
import { extendedStyleCss } from '~~/app/utils/edmStyle'

registerBlock({
  type: 'Image',

  renderMjml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'
    const bgColor = (style.backgroundColor as string) || ''

    const imageUrl = (props.url as string) || ''
    const imageAlt = (props.alt as string) || ''
    const imageLinkHref = (props.linkHref as string) || ''
    const imageWidth = (props.width as string) || '100%'
    const contentAlignment = (props.contentAlignment as string) || textAlign || 'center'

    if (!imageUrl) {
      return `
          <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
            <mj-column>
              <mj-text padding="${padding}" align="${contentAlignment}" color="#9ca3af" background-color="#f3f4f6">
                No image selected
              </mj-text>
            </mj-column>
          </mj-section>`
    }

    return `
        <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-image
              padding="${padding}"
              align="${contentAlignment}"
              src="${imageUrl}"
              alt="${escapeHtml(imageAlt)}"
              ${imageLinkHref ? `href="${imageLinkHref}"` : ''}
              ${imageWidth !== '100%' ? `width="${imageWidth}"` : ''}
              fluid-on-mobile="true"
            />
          </mj-column>
        </mj-section>`
  },

  renderMjmlInline(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'

    const imageUrl = (props.url as string) || ''
    const imageAlt = (props.alt as string) || ''
    const imageLinkHref = (props.linkHref as string) || ''
    const contentAlignment = (props.contentAlignment as string) || textAlign || 'center'

    if (!imageUrl) {
      return `<mj-text padding="${padding}" align="center" color="#9ca3af" background-color="#f3f4f6">No image</mj-text>`
    }

    return `<mj-image padding="${padding}" align="${contentAlignment}" src="${imageUrl}" alt="${escapeHtml(imageAlt)}" ${imageLinkHref ? `href="${imageLinkHref}"` : ''} fluid-on-mobile="true" />`
  },

  renderHtml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'
    const bgColor = (style.backgroundColor as string) || ''

    const imageUrl = (props.url as string) || ''
    const imageAlt = (props.alt as string) || ''
    const imageLinkHref = (props.linkHref as string) || ''
    const contentAlignment = (props.contentAlignment as string) || textAlign || 'center'

    if (!imageUrl) {
      return `
          <tr${anchorIdAttribute(props)}>
            <td style="padding: ${padding}; text-align: ${contentAlignment}; ${bgColor ? `background-color: ${bgColor};` : ''}">
              <div style="background-color: #f3f4f6; padding: 32px; color: #9ca3af;">No image selected</div>
            </td>
          </tr>`
    }

    const imgTag = `<img src="${imageUrl}" alt="${escapeHtml(imageAlt)}" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />`
    const imageHtml = imageLinkHref ? `<a href="${imageLinkHref}">${imgTag}</a>` : imgTag

    return `
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; text-align: ${contentAlignment}; ${bgColor ? `background-color: ${bgColor};` : ''}${extendedStyleCss(style)}">
            ${imageHtml}
          </td>
        </tr>`
  },

  defaultProps: {
    url: '',
    alt: '',
    contentAlignment: 'center'
  }
})
