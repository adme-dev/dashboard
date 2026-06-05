// server/utils/email-marketing/render/index.ts
// Public entry for the email render pipeline. Renders a flyhub document to
// email-safe HTML (pure TS — Workers-safe; no @flyhub/MJML deps) and
// substitutes {{merge_tags}} from `variables`.

import { renderFlyhubDocumentToHtml, isFlyhubFormat } from './flyhub-html-renderer'
import { rewriteHtmlLinksForTracking, type RewriteTrackingInput } from '../trackingLinks'
import type { FlyhubDocument } from './blocks/types'

export interface RenderTemplateOptions {
  subjectLine?: string
  previewText?: string
  primaryColor?: string
  variables?: Record<string, string>
  tracking?: RewriteTrackingInput
}

export function renderTemplateDocument(doc: unknown, opts: RenderTemplateOptions = {}): string {
  if (!isFlyhubFormat(doc)) {
    throw new Error('invalid_flyhub_document')
  }
  return renderFlyhubDocumentToHtml(doc as FlyhubDocument, {
    subjectLine: opts.subjectLine,
    previewText: opts.previewText,
    primaryColor: opts.primaryColor,
    variables: opts.variables
  })
}

export async function renderTrackedTemplateDocument(
  doc: unknown,
  opts: RenderTemplateOptions = {}
): Promise<string> {
  const html = renderTemplateDocument(doc, opts)
  return opts.tracking ? rewriteHtmlLinksForTracking(html, opts.tracking) : html
}
