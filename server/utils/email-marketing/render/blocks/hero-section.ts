import { registerBlock } from '../block-registry'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding } from './types'
import { escapeHtml } from './helpers'
import { anchorIdAttribute } from '~~/app/utils/edmAnchor'

export const HERO_SECTION_BLOCK_TYPE = 'hero-section'

registerBlock({
  type: HERO_SECTION_BLOCK_TYPE,

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textColor = (props.textColor as string) || '#ffffff'

    const imageUrl = (props.imageUrl as string) || ''
    const heading = (props.heading as string) || ''
    const subheading = (props.subheading as string) || ''
    const ctaText = (props.ctaText as string) || ''
    const ctaUrl = (props.ctaUrl as string) || ''

    const ctaMjml
      = ctaText && ctaUrl
        ? `<mj-button href="${escapeHtml(ctaUrl)}" background-color="${context.primaryColor}" color="#ffffff" border-radius="4px" font-size="16px" padding="16px 0 0 0">${escapeHtml(ctaText)}</mj-button>`
        : ''

    const subheadingMjml = subheading
      ? `<mj-text align="center" color="${textColor}" font-size="16px" padding="8px 24px 0 24px">${escapeHtml(subheading)}</mj-text>`
      : ''

    return `
        <mj-hero mode="fluid-height"${imageUrl ? ` background-url="${escapeHtml(imageUrl)}"` : ''} background-color="#1f2937" padding="${padding}" vertical-align="middle">
          <mj-text align="center" color="${textColor}" font-size="28px" font-weight="bold" padding="24px 24px 0 24px">${escapeHtml(heading)}</mj-text>
          ${subheadingMjml}
          ${ctaMjml}
        </mj-hero>`
  },

  renderHtml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const textColor = (props.textColor as string) || '#ffffff'
    const overlayOpacity = (props.overlayOpacity as number) ?? 0.4

    const imageUrl = (props.imageUrl as string) || ''
    const heading = (props.heading as string) || ''
    const subheading = (props.subheading as string) || ''
    const ctaText = (props.ctaText as string) || ''
    const ctaUrl = (props.ctaUrl as string) || ''

    const bgStyle = imageUrl
      ? `background-image: linear-gradient(rgba(0,0,0,${overlayOpacity}), rgba(0,0,0,${overlayOpacity})), url('${escapeHtml(imageUrl)}'); background-size: cover; background-position: center;`
      : 'background-color: #1f2937;'

    const subheadingHtml = subheading
      ? `<p style="margin:8px 0 0;font-size:16px;color:${textColor};">${escapeHtml(subheading)}</p>`
      : ''

    const ctaHtml
      = ctaText && ctaUrl
        ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 24px;background-color:${context.primaryColor};color:#ffffff;text-decoration:none;border-radius:4px;font-size:16px;font-weight:bold;" target="_blank">${escapeHtml(ctaText)}</a></p>`
        : ''

    return `
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; text-align: center; ${bgStyle}">
            <h1 style="margin:0;font-size:28px;font-weight:bold;color:${textColor};line-height:1.3;">${escapeHtml(heading)}</h1>
            ${subheadingHtml}
            ${ctaHtml}
          </td>
        </tr>`
  },

  defaultProps: {
    imageUrl: '',
    heading: '',
    subheading: '',
    ctaText: '',
    ctaUrl: '',
    overlayOpacity: 0.4,
    textColor: '#ffffff'
  }
})
