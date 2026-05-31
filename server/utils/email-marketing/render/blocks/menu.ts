import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { escapeHtml } from './helpers'

registerBlock({
  type: 'menu',

  renderMjml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''
    const textColor = (style.color as string) || '#111827'
    const items = (props.items as Array<{ label: string, url: string }>) || []

    const linkElements = items
      .filter(i => i.label && i.url)
      .map(
        i =>
          `<mj-navbar-link href="${escapeHtml(i.url)}" color="${textColor}" padding="0 12px">${escapeHtml(i.label)}</mj-navbar-link>`
      )
      .join('\n              ')

    return `
        <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-navbar padding="${padding}">
              ${linkElements}
            </mj-navbar>
          </mj-column>
        </mj-section>`
  },

  renderHtml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''
    const textColor = (style.color as string) || '#111827'
    const separator = (props.separator as string) || '|'
    const items = (props.items as Array<{ label: string, url: string }>) || []

    const linkElements = items
      .filter(i => i.label && i.url)
      .map(
        i =>
          `<a href="${escapeHtml(i.url)}" style="color:${textColor};text-decoration:none;" target="_blank">${escapeHtml(i.label)}</a>`
      )
      .join(` <span style="color:#9ca3af;padding:0 4px;">${escapeHtml(separator)}</span> `)

    return `
        <tr>
          <td style="padding: ${padding}; text-align: center; font-size: 14px;${bgColor ? ` background-color: ${bgColor};` : ''}">
            ${linkElements}
          </td>
        </tr>`
  },

  defaultProps: {
    items: [],
    separator: '|'
  }
})
