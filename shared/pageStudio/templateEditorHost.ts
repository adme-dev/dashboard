import { z } from 'zod'
import { codeSha256 } from './codeContent'
export const TemplateEditorScopeSchema=z.object({tenantId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),clientId:z.string().uuid(),siteId:z.string().uuid()}).strict()
/** Exact Sandbox workspace identity; no visitor-supplied hostname or service. */
export async function templateCopyEditorHostname(input:unknown){
  const scope=TemplateEditorScopeSchema.parse(input)
  const digest=await codeSha256([scope.tenantId,scope.clientId,scope.siteId].join(String.fromCharCode(31)))
  return `4174-xf-${digest.slice(0,48)}-editor.xeroflow.io`
}
