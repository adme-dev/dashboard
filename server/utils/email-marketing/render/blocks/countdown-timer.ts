import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { escapeHtml } from './helpers'
import { anchorIdAttribute } from '~~/app/utils/edmAnchor'

export const COUNTDOWN_TIMER_BLOCK_TYPE = 'countdown-timer'

registerBlock({
  type: COUNTDOWN_TIMER_BLOCK_TYPE,

  renderMjml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)

    const targetDate = (props.targetDate as string) || ''
    const label = (props.label as string) || 'Offer ends in'
    const expiredText = (props.expiredText as string) || 'This offer has ended'
    const backgroundColor = (props.backgroundColor as string) || '#1e40af'
    const textColor = (props.textColor as string) || '#ffffff'

    const now = new Date()
    const target = new Date(targetDate)
    const diff = target.getTime() - now.getTime()
    const isExpired = diff <= 0
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const countdownText = isExpired ? expiredText : `${days} days, ${hours} hours remaining`

    return `
        <mj-section padding="0" background-color="${backgroundColor}">
          <mj-column>
            <mj-text
              padding="${padding}"
              align="center"
              color="${textColor}"
              font-size="14px"
              font-weight="600"
              line-height="1.4"
            >${escapeHtml(label)}</mj-text>
            <mj-text
              padding="0 24px 16px 24px"
              align="center"
              color="${textColor}"
              font-size="24px"
              font-weight="bold"
              line-height="1.3"
            >${escapeHtml(countdownText)}</mj-text>
          </mj-column>
        </mj-section>`
  },

  renderHtml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)

    const targetDate = (props.targetDate as string) || ''
    const label = (props.label as string) || 'Offer ends in'
    const expiredText = (props.expiredText as string) || 'This offer has ended'
    const backgroundColor = (props.backgroundColor as string) || '#1e40af'
    const textColor = (props.textColor as string) || '#ffffff'

    const now = new Date()
    const target = new Date(targetDate)
    const diff = target.getTime() - now.getTime()
    const isExpired = diff <= 0
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const countdownText = isExpired ? expiredText : `${days} days, ${hours} hours remaining`

    return `
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; background-color: ${backgroundColor}; text-align: center;">
            <p style="margin: 0 0 4px 0; color: ${textColor}; font-size: 14px; font-weight: 600; line-height: 1.4;">${escapeHtml(label)}</p>
            <p style="margin: 0; color: ${textColor}; font-size: 24px; font-weight: bold; line-height: 1.3;">${escapeHtml(countdownText)}</p>
          </td>
        </tr>`
  },

  defaultProps: {
    targetDate: '',
    label: 'Offer ends in',
    expiredText: 'This offer has ended',
    backgroundColor: '#1e40af',
    textColor: '#ffffff'
  }
})
