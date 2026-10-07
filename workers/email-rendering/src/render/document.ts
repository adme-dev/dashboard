import { isFlyhubFormat } from '../../../../shared/emailRendering/format'
import { createRenderBudget, validateDocumentGraph } from '../../../../shared/emailRendering/bounds'
import type { DocumentRenderOptions } from '../../../../shared/emailRendering/contract'
import { renderFlyhubDocumentToHtml } from './flyhub-html-renderer'
import type { FlyhubDocument } from './blocks/types'

export function renderTemplateDocumentLocally(document: unknown, options: DocumentRenderOptions = {}): string {
  if (!isFlyhubFormat(document)) throw new Error('invalid_flyhub_document')
  validateDocumentGraph(document)
  return renderFlyhubDocumentToHtml(document as FlyhubDocument, { ...options, renderBudget: createRenderBudget() })
}
