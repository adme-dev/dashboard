import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { resolveFontFamily, formatPadding } from './types'
import { escapeHtml, escapeUrl, escapeFontFamilyForHtml } from './helpers'

registerBlock({
  type: 'cta-banner',

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const fontFamily = resolveFontFamily(style.fontFamily, context.fontFamily)

    const heading = (props.heading as string) || ''
    const subheading = (props.subheading as string) || ''
    const ctaText = (props.ctaText as string) || 'Learn More'
    const ctaUrl = (props.ctaUrl as string) || '#'
    const backgroundColor = (props.backgroundColor as string) || '#1e40af'
    const textColor = (props.textColor as string) || '#ffffff'

    return `
        <mj-section padding="0" background-color="${backgroundColor}">
          <mj-column>
            <mj-text
              padding="${padding}"
              align="center"
              color="${textColor}"
              font-size="24px"
              font-family="${fontFamily}"
              font-weight="bold"
              line-height="1.3"
            >${escapeHtml(heading)}</mj-text>${
              subheading
                ? `
            <mj-text
              padding="0 24px 16px 24px"
              align="center"
              color="${textColor}"
              font-size="16px"
              font-family="${fontFamily}"
              font-weight="normal"
              line-height="1.5"
            >${escapeHtml(subheading)}</mj-text>`
                : ''
            }
            <mj-button
              padding="0 24px 24px 24px"
              align="center"
              href="${escapeUrl(ctaUrl)}"
              background-color="${textColor}"
              color="${backgroundColor}"
              border-radius="8px"
              font-family="${fontFamily}"
              font-weight="600"
              font-size="16px"
              inner-padding="12px 24px"
            >${escapeHtml(ctaText)}</mj-button>
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

    const heading = (props.heading as string) || ''
    const subheading = (props.subheading as string) || ''
    const ctaText = (props.ctaText as string) || 'Learn More'
    const ctaUrl = (props.ctaUrl as string) || '#'
    const backgroundColor = (props.backgroundColor as string) || '#1e40af'
    const textColor = (props.textColor as string) || '#ffffff'

    return `
        <tr>
          <td style="padding: ${padding}; background-color: ${backgroundColor}; text-align: center;">
            <h2 style="margin: 0 0 8px 0; color: ${textColor}; font-size: 24px; font-family: ${fontFamily}; font-weight: bold; line-height: 1.3;">${escapeHtml(heading)}</h2>${
              subheading
                ? `
            <p style="margin: 0 0 16px 0; color: ${textColor}; font-size: 16px; font-family: ${fontFamily}; font-weight: normal; line-height: 1.5;">${escapeHtml(subheading)}</p>`
                : ''
            }
            <a href="${escapeUrl(ctaUrl)}" style="display: inline-block; padding: 12px 24px; background-color: ${textColor}; color: ${backgroundColor}; text-decoration: none; font-family: ${fontFamily}; font-weight: 600; font-size: 16px; line-height: 1; border-radius: 8px;">${escapeHtml(ctaText)}</a>
          </td>
        </tr>`
  },

  defaultProps: {
    heading: '',
    subheading: '',
    ctaText: 'Learn More',
    ctaUrl: '#',
    backgroundColor: '#1e40af',
    textColor: '#ffffff'
  }
})
