import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { escapeHtml } from './helpers'

registerBlock({
  type: 'footer',

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor
      = (props.backgroundColor as string) || (style.backgroundColor as string) || '#f5f5f5'
    const showUnsubscribe = props.showUnsubscribe !== false
    const showAddress = props.showAddress !== false
    const additionalText = (props.additionalText as string) || ''

    const dealerName = (context.dealerContext?.name as string) || ''
    const dealerAddress = (context.dealerContext?.address as string) || ''
    const dealerWebsite = (context.dealerContext?.website as string) || ''
    const unsubscribeUrl = context.mergeFields?.unsubscribe_url || '{{unsubscribe_url}}'
    const currentYear = context.mergeFields?.current_year || new Date().getFullYear().toString()

    const parts: string[] = []

    if (showAddress && dealerAddress) {
      parts.push(
        `<mj-text align="center" font-size="12px" color="#9ca3af" padding="4px 24px">${escapeHtml(dealerAddress)}</mj-text>`
      )
    }

    if (dealerWebsite) {
      parts.push(
        `<mj-text align="center" font-size="12px" color="#9ca3af" padding="4px 24px"><a href="${escapeHtml(dealerWebsite)}" style="color:#6b7280;text-decoration:underline;" target="_blank">${escapeHtml(dealerWebsite)}</a></mj-text>`
      )
    }

    if (dealerName) {
      parts.push(
        `<mj-text align="center" font-size="12px" color="#9ca3af" padding="4px 24px">&copy; ${escapeHtml(currentYear)} ${escapeHtml(dealerName)}. All rights reserved.</mj-text>`
      )
    }

    if (additionalText) {
      parts.push(
        `<mj-text align="center" font-size="12px" color="#9ca3af" padding="4px 24px">${escapeHtml(additionalText)}</mj-text>`
      )
    }

    if (showUnsubscribe) {
      parts.push(
        `<mj-text align="center" font-size="12px" color="#9ca3af" padding="4px 24px"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;" target="_blank">Unsubscribe</a></mj-text>`
      )
    }

    return `
        <mj-section padding="${padding}" background-color="${bgColor}">
          <mj-column>
            ${parts.join('\n            ')}
          </mj-column>
        </mj-section>`
  },

  renderHtml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor
      = (props.backgroundColor as string) || (style.backgroundColor as string) || '#f5f5f5'
    const showUnsubscribe = props.showUnsubscribe !== false
    const showAddress = props.showAddress !== false
    const additionalText = (props.additionalText as string) || ''

    const dealerName = (context.dealerContext?.name as string) || ''
    const dealerAddress = (context.dealerContext?.address as string) || ''
    const dealerWebsite = (context.dealerContext?.website as string) || ''
    const unsubscribeUrl = context.mergeFields?.unsubscribe_url || '{{unsubscribe_url}}'
    const currentYear = context.mergeFields?.current_year || new Date().getFullYear().toString()

    const lines: string[] = []

    if (showAddress && dealerAddress) {
      lines.push(
        `<p style="margin:4px 0;font-size:12px;color:#9ca3af;">${escapeHtml(dealerAddress)}</p>`
      )
    }

    if (dealerWebsite) {
      lines.push(
        `<p style="margin:4px 0;font-size:12px;"><a href="${escapeHtml(dealerWebsite)}" style="color:#6b7280;text-decoration:underline;" target="_blank">${escapeHtml(dealerWebsite)}</a></p>`
      )
    }

    if (dealerName) {
      lines.push(
        `<p style="margin:4px 0;font-size:12px;color:#9ca3af;">&copy; ${escapeHtml(currentYear)} ${escapeHtml(dealerName)}. All rights reserved.</p>`
      )
    }

    if (additionalText) {
      lines.push(
        `<p style="margin:4px 0;font-size:12px;color:#9ca3af;">${escapeHtml(additionalText)}</p>`
      )
    }

    if (showUnsubscribe) {
      lines.push(
        `<p style="margin:4px 0;font-size:12px;"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;" target="_blank">Unsubscribe</a></p>`
      )
    }

    return `
        <tr>
          <td style="padding: ${padding}; text-align: center; background-color: ${bgColor};">
            ${lines.join('\n            ')}
          </td>
        </tr>`
  },

  defaultProps: {
    showUnsubscribe: true,
    showAddress: true,
    additionalText: '',
    backgroundColor: '#f5f5f5'
  }
})
