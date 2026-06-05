import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { resolveFontFamily, formatPadding } from './types'
import {
  escapeHtml,
  escapeUrl,
  escapeFontFamilyForHtml,
  renderStarsHtml,
  renderStarsMjml
} from './helpers'
import { anchorIdAttribute } from '~~/app/utils/edmAnchor'

export const TESTIMONIAL_BLOCK_TYPE = 'testimonial'

registerBlock({
  type: TESTIMONIAL_BLOCK_TYPE,

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const fontFamily = resolveFontFamily(style.fontFamily, context.fontFamily)

    const quote = (props.quote as string) || ''
    const authorName = (props.authorName as string) || ''
    const authorRole = (props.authorRole as string) || ''
    const rating = typeof props.rating === 'number' ? props.rating : 0
    const avatarUrl = (props.avatarUrl as string) || ''

    const starsMarkup
      = rating > 0
        ? `<mj-text padding="0 24px 8px 24px" align="center" font-size="18px" line-height="1" color="#f59e0b">${renderStarsMjml(rating)}</mj-text>`
        : ''

    const avatarMarkup = avatarUrl
      ? `<mj-image padding="0 0 8px 0" align="center" src="${escapeUrl(avatarUrl)}" width="48px" height="48px" border-radius="24px" />`
      : ''

    return `
        <mj-section padding="0">
          <mj-column>
            <mj-text
              padding="${padding}"
              align="center"
              color="#d1d5db"
              font-size="48px"
              font-family="Georgia, serif"
              line-height="1"
            >&ldquo;</mj-text>
            <mj-text
              padding="0 24px 16px 24px"
              align="center"
              color="#374151"
              font-size="16px"
              font-family="${fontFamily}"
              font-style="italic"
              line-height="1.6"
            >${escapeHtml(quote)}</mj-text>
            <mj-divider padding="0 24px 16px 24px" border-color="#e5e7eb" border-width="1px" width="60px" />
            ${avatarMarkup}
            <mj-text
              padding="0 24px 4px 24px"
              align="center"
              color="#111827"
              font-size="14px"
              font-family="${fontFamily}"
              font-weight="600"
              line-height="1.4"
            >${escapeHtml(authorName)}</mj-text>${
              authorRole
                ? `
            <mj-text
              padding="0 24px 8px 24px"
              align="center"
              color="#6b7280"
              font-size="13px"
              font-family="${fontFamily}"
              font-weight="normal"
              line-height="1.4"
            >${escapeHtml(authorRole)}</mj-text>`
                : ''
            }
            ${starsMarkup}
          </mj-column>
        </mj-section>`
  },

  renderHtml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const fontFamily = escapeFontFamilyForHtml(
      resolveFontFamily(style.fontFamily, context.fontFamily)
    )

    const quote = (props.quote as string) || ''
    const authorName = (props.authorName as string) || ''
    const authorRole = (props.authorRole as string) || ''
    const rating = typeof props.rating === 'number' ? props.rating : 0
    const avatarUrl = (props.avatarUrl as string) || ''

    const starsMarkup
      = rating > 0
        ? `<p style="margin: 0 0 8px 0; text-align: center;">${renderStarsHtml(rating)}</p>`
        : ''

    const avatarMarkup = avatarUrl
      ? `<img src="${escapeUrl(avatarUrl)}" alt="" width="48" height="48" style="display: block; margin: 0 auto 8px auto; border-radius: 24px;" />`
      : ''

    return `
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; text-align: center;">
            <p style="margin: 0 0 8px 0; color: #d1d5db; font-size: 48px; font-family: Georgia, serif; line-height: 1;">&ldquo;</p>
            <p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; font-family: ${fontFamily}; font-style: italic; line-height: 1.6;">${escapeHtml(quote)}</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; width: 60px; margin: 0 auto 16px auto;" />
            ${avatarMarkup}
            <p style="margin: 0 0 4px 0; color: #111827; font-size: 14px; font-family: ${fontFamily}; font-weight: 600; line-height: 1.4;">${escapeHtml(authorName)}</p>${
              authorRole
                ? `
            <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; font-family: ${fontFamily}; font-weight: normal; line-height: 1.4;">${escapeHtml(authorRole)}</p>`
                : ''
            }
            ${starsMarkup}
          </td>
        </tr>`
  },

  defaultProps: {
    quote: '',
    authorName: '',
    authorRole: '',
    rating: 0,
    avatarUrl: ''
  }
})
