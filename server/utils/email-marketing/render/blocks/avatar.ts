import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { anchorIdAttribute } from '~~/app/utils/edmAnchor'
import { extendedStyleCss } from '~~/app/utils/edmStyle'

export const AVATAR_BLOCK_TYPE = 'Avatar'

registerBlock({
  type: AVATAR_BLOCK_TYPE,

  renderMjml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'
    const bgColor = (style.backgroundColor as string) || ''
    const richStyle = extendedStyleCss(style)

    const avatarSrc = (props.src as string) || ''
    const avatarSize = (props.size as number) || 64
    const avatarShape = (props.shape as string) || 'circle'
    const borderRadius = avatarShape === 'circle' ? '50%' : avatarShape === 'rounded' ? '8px' : '0'
    const wrapperStyle = [
      `padding: ${padding};`,
      `text-align: ${textAlign || 'center'};`,
      bgColor ? `background-color: ${bgColor};` : '',
      richStyle
    ].filter(Boolean).join(' ')

    if (!avatarSrc) {
      return `
          <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
            <mj-column>
              <mj-raw>
                <div style="${wrapperStyle}">
                  <div style="width: ${avatarSize}px; height: ${avatarSize}px; border-radius: ${borderRadius}; background-color: #e5e7eb; display: inline-block;"></div>
                </div>
              </mj-raw>
            </mj-column>
          </mj-section>`
    }

    if (richStyle) {
      return `
          <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
            <mj-column>
              <mj-raw>
                <div style="${wrapperStyle}">
                  <img src="${avatarSrc}" alt="Avatar" style="width: ${avatarSize}px; height: ${avatarSize}px; border-radius: ${borderRadius}; display: inline-block;" />
                </div>
              </mj-raw>
            </mj-column>
          </mj-section>`
    }

    return `
        <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-image
              padding="${padding}"
              align="${textAlign || 'center'}"
              src="${avatarSrc}"
              alt="Avatar"
              width="${avatarSize}px"
              border-radius="${borderRadius}"
            />
          </mj-column>
        </mj-section>`
  },

  renderHtml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textAlign = (style.textAlign as string) || 'left'
    const bgColor = (style.backgroundColor as string) || ''

    const avatarSrc = (props.src as string) || ''
    const avatarSize = (props.size as number) || 64
    const avatarShape = (props.shape as string) || 'circle'
    const borderRadius = avatarShape === 'circle' ? '50%' : avatarShape === 'rounded' ? '8px' : '0'

    if (!avatarSrc) {
      return `
          <tr${anchorIdAttribute(props)}>
            <td style="padding: ${padding}; text-align: ${textAlign || 'center'}; ${bgColor ? `background-color: ${bgColor};` : ''}">
              <div style="width: ${avatarSize}px; height: ${avatarSize}px; border-radius: ${borderRadius}; background-color: #e5e7eb; display: inline-block;"></div>
            </td>
          </tr>`
    }

    return `
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; text-align: ${textAlign || 'center'}; ${bgColor ? `background-color: ${bgColor};` : ''}${extendedStyleCss(style)}">
            <img src="${avatarSrc}" alt="Avatar" style="width: ${avatarSize}px; height: ${avatarSize}px; border-radius: ${borderRadius}; display: inline-block;" />
          </td>
        </tr>`
  },

  defaultProps: {
    src: '',
    size: 64,
    shape: 'circle'
  }
})
