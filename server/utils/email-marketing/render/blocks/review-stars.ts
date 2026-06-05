import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { escapeHtml, renderStarsHtml, renderStarsMjml } from './helpers'
import { anchorIdAttribute } from '~~/app/utils/edmAnchor'

const SIZE_MAP: Record<string, string> = {
  sm: '14px',
  md: '18px',
  lg: '24px'
}

export const REVIEW_STARS_BLOCK_TYPE = 'review-stars'

registerBlock({
  type: REVIEW_STARS_BLOCK_TYPE,

  renderMjml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)

    const rating = typeof props.rating === 'number' ? props.rating : 0
    const maxStars = typeof props.maxStars === 'number' ? props.maxStars : 5
    const size = (props.size as string) || 'md'
    const color = (props.color as string) || '#f59e0b'
    const label = (props.label as string) || ''
    const fontSize = SIZE_MAP[size] || SIZE_MAP.md

    const starsText = renderStarsMjml(rating, maxStars)
    const labelMarkup = label
      ? ` <span style="font-size:14px;color:#6b7280;margin-left:8px;">${escapeHtml(label)}</span>`
      : ''

    return `
        <mj-section padding="0">
          <mj-column>
            <mj-text
              padding="${padding}"
              align="center"
              font-size="${fontSize}"
              color="${color}"
              line-height="1.4"
              letter-spacing="2px"
            >${starsText}${labelMarkup}</mj-text>
          </mj-column>
        </mj-section>`
  },

  renderHtml(block: FlyhubBlock, _context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)

    const rating = typeof props.rating === 'number' ? props.rating : 0
    const maxStars = typeof props.maxStars === 'number' ? props.maxStars : 5
    const size = (props.size as string) || 'md'
    const color = (props.color as string) || '#f59e0b'
    const label = (props.label as string) || ''
    const fontSize = SIZE_MAP[size] || SIZE_MAP.md

    const starsMarkup = renderStarsHtml(rating, maxStars, color).replace(
      /font-size:\d+px/,
      `font-size:${fontSize}`
    )
    const labelMarkup = label
      ? `<span style="font-size:14px;color:#6b7280;margin-left:8px;">${escapeHtml(label)}</span>`
      : ''

    return `
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; text-align: center;">
            ${starsMarkup}${labelMarkup}
          </td>
        </tr>`
  },

  defaultProps: {
    rating: 0,
    maxStars: 5,
    size: 'md',
    color: '#f59e0b',
    label: ''
  }
})
