// Rendering is provided by the private Worker. Tracking stays with the caller.
import { assertDocumentConditions } from '../../../../shared/emailRendering/conditionProtection'
import { validateDocumentGraph } from '../../../../shared/emailRendering/bounds'
import type { EmailDesignBlock } from '../../../../shared/emailRendering/designContract'
import { isFlyhubFormat } from '../../../../shared/emailRendering/format'
import type { DocumentRenderOptions, EmailRendererClient } from '../../../../shared/emailRendering/contract'
import { rewriteHtmlLinksForTracking, type RewriteTrackingInput } from '../trackingLinks'

export interface RenderTemplateOptions extends DocumentRenderOptions {
  tracking?: RewriteTrackingInput
}

export async function renderTemplateDocument(doc: unknown, opts: RenderTemplateOptions, renderer: EmailRendererClient): Promise<string> {
  if (!isFlyhubFormat(doc)) throw new Error('invalid_flyhub_document')
  validateDocumentGraph(doc)
  assertDocumentConditions(doc as Record<string, EmailDesignBlock>)
  // Optional server-side fields are omitted from the strict JSON envelope.
  const options: DocumentRenderOptions = {}
  if (opts.subjectLine !== undefined) options.subjectLine = opts.subjectLine
  if (opts.previewText !== undefined) options.previewText = opts.previewText
  if (opts.primaryColor !== undefined) options.primaryColor = opts.primaryColor
  if (opts.variables !== undefined) options.variables = opts.variables
  return renderer.renderDocument(doc, options)
}

export async function renderTrackedTemplateDocument(doc: unknown, opts: RenderTemplateOptions, renderer: EmailRendererClient): Promise<string> {
  const html = await renderTemplateDocument(doc, opts, renderer)
  return opts.tracking ? rewriteHtmlLinksForTracking(html, opts.tracking) : html
}
