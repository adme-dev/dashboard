/**
 * FlyHub to HTML Email Renderer
 *
 * Converts FlyHub document format to email-safe HTML with inline styles.
 * This renderer preserves all FlyHub styles correctly and includes responsive
 * CSS for mobile devices.
 *
 * Block rendering is delegated to the block registry — this file only
 * handles document-level orchestration (HTML wrapper, head, responsive CSS).
 */

// Trigger block registration. Import a named export so Vite SSR can't
// tree-shake the side-effect import (which registers every block type).
import { BLOCKS_LOADED } from './blocks'
import { renderBlock } from './block-registry'
import { FONT_FAMILY_MAP } from './blocks/types'
import type {
  FlyhubBlock,
  BlockRenderContext,
  FlyhubDocument,
  PreviewVehicle,
  PreviewOffer
} from './blocks/types'

void BLOCKS_LOADED

/**
 * Get font family CSS from FlyHub font family key
 */
function getFontFamily(fontKey: string | null | undefined): string {
  return FONT_FAMILY_MAP[fontKey || 'MODERN_SANS'] || FONT_FAMILY_MAP['MODERN_SANS']
}

/**
 * Build a BlockRenderContext from the HTML renderer's parameters
 */
function buildBlockRenderContext(
  document: FlyhubDocument,
  primaryColor: string,
  dynamicBlockVehicles?: Map<string, PreviewVehicle[]>,
  dynamicBlockOffers?: Map<string, PreviewOffer[]>
): BlockRenderContext {
  const rootProps = (document.root.data.props || {}) as Record<string, unknown>
  const fontFamily = getFontFamily(rootProps.fontFamily as string)

  return {
    dynamicData: {
      vehicles: dynamicBlockVehicles || new Map(),
      offers: dynamicBlockOffers || new Map()
    },
    mergeFields: {},
    baseUrl: '',
    primaryColor,
    fontFamily,
    _document: document as unknown as Record<string, FlyhubBlock>
  }
}

/**
 * Render a FlyHub document to complete email HTML
 *
 * This is the main export function that converts a FlyHub document to a complete
 * HTML email with proper DOCTYPE, head, styles, and body.
 */
export function renderFlyhubDocumentToHtml(
  doc: FlyhubDocument,
  options: {
    subjectLine?: string
    previewText?: string
    primaryColor?: string
    dynamicBlockVehicles?: Map<string, PreviewVehicle[]>
    dynamicBlockOffers?: Map<string, PreviewOffer[]>
    variables?: Record<string, string>
  } = {}
): string {
  const rootBlock = doc.root
  const rootProps = (rootBlock.data.props || {}) as Record<string, unknown>

  const backdropColor = (rootProps.backdropColor as string) || '#F5F5F5'
  const canvasColor = (rootProps.canvasColor as string) || '#FFFFFF'
  const textColor = (rootProps.textColor as string) || '#262626'
  const fontFamily = getFontFamily(rootProps.fontFamily as string)
  const borderRadius = (rootProps.borderRadius as number) || 0
  const borderColor = (rootProps.borderColor as string) || ''
  const contentWidth = 600
  const primaryColor = options.primaryColor || '#2f4574'

  // Build context and render all child blocks via the block registry
  const blockCtx = buildBlockRenderContext(
    doc,
    primaryColor,
    options.dynamicBlockVehicles,
    options.dynamicBlockOffers
  )
  const contentHtml = renderBlock(rootBlock, 'html', blockCtx)

  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${options.subjectLine || 'Email Preview'}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .fluid { max-width: 100% !important; height: auto !important; margin-left: auto !important; margin-right: auto !important; }
      .stack-column, .stack-column-center { display: block !important; width: 100% !important; max-width: 100% !important; direction: ltr !important; }
      .columns-row { display: block !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${backdropColor}; font-family: ${fontFamily}; color: ${textColor};">
  ${options.previewText ? `<div style="display: none; font-size: 1px; color: ${backdropColor}; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">${options.previewText}</div>` : ''}

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${backdropColor};">
    <tr>
      <td align="center" style="padding: 20px 10px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${contentWidth}" class="email-container" style="max-width: ${contentWidth}px; background-color: ${canvasColor}; ${borderRadius ? `border-radius: ${borderRadius}px;` : ''} ${borderColor ? `border: 1px solid ${borderColor};` : ''} overflow: hidden;">
          <tr>
            <td>
              ${contentHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  // Replace variables if provided
  if (options.variables) {
    for (const [key, value] of Object.entries(options.variables)) {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), value)
    }
  }

  return html
}

/**
 * Check if a JSON object is in FlyHub format
 */
export function isFlyhubFormat(json: unknown): json is FlyhubDocument {
  return (
    !!json
    && typeof json === 'object'
    && 'root' in json
    && (json as FlyhubDocument).root !== undefined
    && typeof (json as FlyhubDocument).root === 'object'
    && (json as FlyhubDocument).root.type === 'EmailLayout'
  )
}
