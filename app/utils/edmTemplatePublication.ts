import type { DesignTemplateRequest } from '~~/shared/emailRendering/designTemplates'

/** Local review binding only. The existing flow adds operation identity and the
 * server derives canonical content; this snapshot is never sent to the API. */
export interface ReviewedTemplatePublication {
  request: Omit<Extract<DesignTemplateRequest, { command: 'publish-template' }>, 'version' | 'operationId'>
    | Omit<Extract<DesignTemplateRequest, { command: 'revise-template' }>, 'version' | 'operationId'>
  sourceSnapshot: string
}
