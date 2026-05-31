import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { escapeHtml } from './helpers'

interface FeatureItem {
  icon: string
  heading: string
  description: string
}

registerBlock({
  type: 'feature-grid',

  renderMjml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''
    const iconColor = (props.iconColor as string) || '#3b82f6'
    const features = (props.features as FeatureItem[]) || []

    if (!features.length) return ''

    const columns = features
      .map(
        f => `
            <mj-column padding="8px">
              <mj-text align="center" font-size="32px" padding="0 0 8px 0" color="${iconColor}">${f.icon || ''}</mj-text>
              <mj-text align="center" font-size="16px" font-weight="bold" color="#111827" padding="0 0 4px 0">${escapeHtml(f.heading || '')}</mj-text>
              <mj-text align="center" font-size="14px" color="#6b7280" padding="0">${escapeHtml(f.description || '')}</mj-text>
            </mj-column>`
      )
      .join('')

    return `
        <mj-section padding="${padding}"${bgColor ? ` background-color="${bgColor}"` : ''}>
          ${columns}
        </mj-section>`
  },

  renderHtml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''
    const iconColor = (props.iconColor as string) || '#3b82f6'
    const features = (props.features as FeatureItem[]) || []
    const columns = Math.min((props.columns as number) || 3, features.length || 1)

    if (!features.length) return ''

    const colWidth = Math.floor(100 / columns)

    const cells = features
      .map(
        f => `
              <td style="width:${colWidth}%;padding:8px;text-align:center;vertical-align:top;">
                <div style="font-size:32px;color:${iconColor};margin-bottom:8px;">${f.icon || ''}</div>
                <p style="margin:0 0 4px;font-size:16px;font-weight:bold;color:#111827;">${escapeHtml(f.heading || '')}</p>
                <p style="margin:0;font-size:14px;color:#6b7280;">${escapeHtml(f.description || '')}</p>
              </td>`
      )
      .join('')

    return `
        <tr>
          <td style="padding: ${padding};${bgColor ? ` background-color: ${bgColor};` : ''}">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
              <tr>
                ${cells}
              </tr>
            </table>
          </td>
        </tr>`
  },

  defaultProps: {
    features: [],
    columns: 3,
    iconColor: '#3b82f6'
  }
})
