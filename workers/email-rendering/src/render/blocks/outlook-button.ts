import { boundedText } from '../boundedText'
import type { FlyhubBlock, BlockRenderContext } from './types'
import { formatPadding, resolveFontFamily } from './types'
import { escapeHtml, escapeFontFamilyForHtml } from './helpers'
import { anchorIdAttribute } from '../../../../../app/utils/edmAnchor'
import { EmailThemeColor } from '../../../../../shared/emailRendering/renderingQuality'

/** Generated HTML only. Fixed VML dimensions are deterministic estimates, not
 * font measurement; the explicit width can be reviewed with the final copy. */
export function renderOutlookButton(block: FlyhubBlock, context: BlockRenderContext): string {
  const props = block.data.props ?? {}
  const style = block.data.style ?? {}
  const color = (value: unknown, fallback: string) => EmailThemeColor.safeParse(value).success ? value as string : fallback
  const background = color(props.buttonBackgroundColor, color(context.primaryColor, '#2f4574'))
  const foreground = color(props.buttonTextColor, '#ffffff')
  const outerBackground = color(style.backgroundColor, '')
  const fontSize = typeof style.fontSize === 'number' && Number.isFinite(style.fontSize) && style.fontSize >= 10 && style.fontSize <= 72 ? style.fontSize : 16
  const fontFamily = escapeHtml(escapeFontFamilyForHtml(resolveFontFamily(style.fontFamily, context.fontFamily)), context.renderBudget)
  const align = ['left', 'center', 'right'].includes(style.textAlign ?? '') ? style.textAlign : 'left'
  const sizes: Record<string, [number, number]> = { 'x-small': [6, 12], 'small': [8, 16], 'medium': [12, 24], 'large': [16, 32] }
  const [vertical, horizontal] = sizes[String(props.size)] ?? sizes.medium!
  const height = Math.ceil(fontSize * 1.2 + vertical * 2)
  const contextWidth = typeof context.contentWidth === 'number' && Number.isFinite(context.contentWidth) ? context.contentWidth : 600
  const available = Math.max(32, Math.min(960, contextWidth - (style.padding?.left ?? 24) - (style.padding?.right ?? 24)))
  const width = Math.min(available, typeof props.outlookWidth === 'number' ? props.outlookWidth : props.fullWidth === true ? available : 200)
  const radius = props.buttonStyle === 'pill' ? height / 2 : props.buttonStyle === 'rounded' || !props.buttonStyle ? 8 : 0
  const arc = Math.round(Math.min(100, radius / Math.min(height, width) * 200))
  const text = escapeHtml(typeof props.text === 'string' && props.text ? props.text : 'Click here', context.renderBudget)
  const url = escapeHtml(typeof props.url === 'string' && props.url ? props.url : '#', context.renderBudget)
  const weight = style.fontWeight === 'bold' ? 'bold' : '600'
  return boundedText(context.renderBudget)`
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${formatPadding(style.padding)}; text-align: ${align}; ${outerBackground ? boundedText(context.renderBudget)`background-color: ${outerBackground};` : ''}">
            <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:${height}px;v-text-anchor:middle;width:${width}px;" arcsize="${arc}%" stroke="f" fillcolor="${background}"><w:anchorlock/><v:textbox inset="0,0,0,0"><center style="color:${foreground};font-family:${fontFamily};font-size:${fontSize}px;font-weight:${weight};">${text}</center></v:textbox></v:roundrect><![endif]-->
            <!--[if !mso]><!--><a href="${url}" style="display:inline-block;box-sizing:border-box;width:${width}px;max-width:100%;padding:${vertical}px ${horizontal}px;background-color:${background};color:${foreground};text-decoration:none;text-align:center;font-family:${fontFamily};font-weight:${weight};font-size:${fontSize}px;line-height:1.2;border-radius:${radius}px;mso-hide:all;">${text}</a><!--<![endif]-->
          </td>
        </tr>`
}
