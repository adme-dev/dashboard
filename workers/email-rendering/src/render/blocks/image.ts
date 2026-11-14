import { boundedText } from '../boundedText'
import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { escapeHtml, escapeUrl } from './helpers'
import { anchorIdAttribute } from '../../../../../app/utils/edmAnchor'
import { extendedStyleCss } from '../../../../../app/utils/edmStyle'

export const IMAGE_BLOCK_TYPE = 'Image'

registerBlock({
  type: IMAGE_BLOCK_TYPE,

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
      return boundedText(_context.renderBudget)`
          <mj-section padding="0"${bgColor ? boundedText(_context.renderBudget)` background-color="${bgColor}"` : ''}>
            <mj-column>
              <mj-text padding="${padding}" align="${contentAlignment}" color="#9ca3af" background-color="#f3f4f6">
                No image selected
              </mj-text>
            </mj-column>
          </mj-section>`
    }

    return boundedText(_context.renderBudget)`
        <mj-section padding="0"${bgColor ? boundedText(_context.renderBudget)` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-image
              padding="${padding}"
              align="${contentAlignment}"
              src="${imageUrl}"
              alt="${escapeHtml(imageAlt)}"
              ${imageLinkHref ? boundedText(_context.renderBudget)`href="${escapeUrl(imageLinkHref)}"` : ''}
              ${imageWidth !== '100%' ? boundedText(_context.renderBudget)`width="${imageWidth}"` : ''}
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
      return boundedText(_context.renderBudget)`<mj-text padding="${padding}" align="center" color="#9ca3af" background-color="#f3f4f6">No image</mj-text>`
    }

    return boundedText(_context.renderBudget)`<mj-image padding="${padding}" align="${contentAlignment}" src="${imageUrl}" alt="${escapeHtml(imageAlt)}" ${imageLinkHref ? boundedText(_context.renderBudget)`href="${escapeUrl(imageLinkHref)}"` : ''} fluid-on-mobile="true" />`
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
      return boundedText(_context.renderBudget)`
          <tr${anchorIdAttribute(props)}>
            <td style="padding: ${padding}; text-align: ${contentAlignment}; ${bgColor ? boundedText(_context.renderBudget)`background-color: ${bgColor};` : ''}">
              <div style="background-color: #f3f4f6; padding: 32px; color: #9ca3af;">No image selected</div>
            </td>
          </tr>`
    }

    const darkSrc = _context.darkMode && typeof props.darkSrc === 'string' ? props.darkSrc : ''
    // Defined precedence: a dark-mode pair owns this slot on every width, so a
    // mobile source is not emitted alongside it (avoids a third competing image).
    if (darkSrc) {
      const imageStyle = 'max-width: 100%; height: auto; display: block; margin: 0 auto;'
      const light = boundedText(_context.renderBudget)`<img class="edm-light-image" src="${escapeHtml(imageUrl, _context.renderBudget)}" alt="${escapeHtml(imageAlt, _context.renderBudget)}" style="${imageStyle}" />`
      // Word-based Outlook keeps the light logo; supporting clients reveal the
      // dark variant through the generated head CSS only.
      const dark = boundedText(_context.renderBudget)`<!--[if !mso]><!--><img class="edm-dark-image" src="${escapeHtml(darkSrc, _context.renderBudget)}" alt="${escapeHtml(imageAlt, _context.renderBudget)}" style="${imageStyle} display: none; max-height: 0; overflow: hidden; mso-hide: all;" /><!--<![endif]-->`
      const images = boundedText(_context.renderBudget)`${light}${dark}`
      const linked = imageLinkHref ? boundedText(_context.renderBudget)`<a href="${escapeUrl(imageLinkHref)}">${images}</a>` : images
      return boundedText(_context.renderBudget)`
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; text-align: ${contentAlignment}; ${bgColor ? boundedText(_context.renderBudget)`background-color: ${bgColor};` : ''}${extendedStyleCss(style)}">
            ${linked}
          </td>
        </tr>`
    }

    const imgTag = boundedText(_context.renderBudget)`<img src="${imageUrl}" alt="${escapeHtml(imageAlt)}" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />`
    // A mobile image override is the standard swap: the desktop image stays the
    // default (Outlook, clients without media queries); the mobile image is
    // hidden until the mobile breakpoint reveals it and hides the desktop one.
    const mobileProps = (data.mobile?.props || {}) as Record<string, unknown>
    const mobileUrl = typeof mobileProps.url === 'string' && mobileProps.url && mobileProps.url !== imageUrl ? mobileProps.url : ''
    const mobileAlt = typeof mobileProps.alt === 'string' ? mobileProps.alt : imageAlt
    const images = mobileUrl
      ? boundedText(_context.renderBudget)`<img class="edm-img-desktop" src="${imageUrl}" alt="${escapeHtml(imageAlt)}" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" /><!--[if !mso]><!--><img class="edm-img-mobile" src="${escapeHtml(mobileUrl, _context.renderBudget)}" alt="${escapeHtml(mobileAlt, _context.renderBudget)}" style="max-width: 100%; height: auto; display: none; max-height: 0; overflow: hidden; margin: 0 auto; mso-hide: all;" /><!--<![endif]-->`
      : imgTag
    const imageHtml = imageLinkHref ? boundedText(_context.renderBudget)`<a href="${escapeUrl(imageLinkHref)}">${images}</a>` : images

    return boundedText(_context.renderBudget)`
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; text-align: ${contentAlignment}; ${bgColor ? boundedText(_context.renderBudget)`background-color: ${bgColor};` : ''}${extendedStyleCss(style)}">
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
