// server/utils/email-marketing/render/index.ts
// Public entry for the email render pipeline. Renders a flyhub document to
// email-safe HTML (pure TS — Workers-safe; no @flyhub/MJML deps) and
// substitutes {{merge_tags}} from `variables`.

import { renderFlyhubDocumentToHtml, isFlyhubFormat } from './flyhub-html-renderer'
import type { FlyhubDocument } from './blocks/types'

export interface RenderTemplateOptions {
  subjectLine?: string
  previewText?: string
  primaryColor?: string
  variables?: Record<string, string>
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

export { isFlyhubFormat }
export type { FlyhubDocument }
