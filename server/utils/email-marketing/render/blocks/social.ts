import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { escapeHtml, escapeUrl } from './helpers'
import { anchorIdAttribute } from '~~/app/utils/edmAnchor'

const PLATFORM_NAMES: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  x: 'X',
  tiktok: 'TikTok',
  google: 'Google'
}

registerBlock({
  type: 'social',

  renderMjml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''
    const iconSize = (props.iconSize as number) || 32
    const iconStyle = (props.iconStyle as string) || 'colored'
    const alignment = (props.alignment as string) || (style.textAlign as string) || 'center'
    const links = (props.links as Array<{ platform: string, url: string }>) || []

    const elements = links
      .filter(l => l.platform && l.url)
      .map((l) => {
        const name = l.platform.toLowerCase()
        return `<mj-social-element name="${escapeHtml(name)}" href="${escapeUrl(l.url)}" icon-size="${iconSize}px" ${iconStyle === 'monochrome' ? 'color="#333333"' : ''} />`
      })
      .join('\n              ')

    return `
        <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-social padding="${padding}" icon-size="${iconSize}px" mode="horizontal" align="${alignment}">
              ${elements}
            </mj-social>
          </mj-column>
        </mj-section>`
  },

  renderHtml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''
    const alignment = (props.alignment as string) || (style.textAlign as string) || 'center'
    const links = (props.links as Array<{ platform: string, url: string }>) || []

    const linkElements = links
      .filter(l => l.platform && l.url)
      .map((l) => {
        const label = PLATFORM_NAMES[l.platform.toLowerCase()] || escapeHtml(l.platform)
        return `<a href="${escapeUrl(l.url)}" style="color:#3b82f6;text-decoration:none;padding:0 8px;" target="_blank">${label}</a>`
      })
      .join(' ')

    return `
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; text-align: ${alignment};${bgColor ? ` background-color: ${bgColor};` : ''}">
            ${linkElements}
          </td>
        </tr>`
  },

  defaultProps: {
    links: [],
    iconSize: 32,
    iconStyle: 'colored'
  }
})
