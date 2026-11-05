import { getRouterParam, readBody, type H3Event } from 'h3'
import { z } from 'zod'
import { prepareTemplateAction } from './templatePreviewHttp'
import { copyTemplateVersion } from './templateCopy'
import type { TemplateActor } from './templateCatalogue'
export async function templateCopyHandler(event:H3Event,kind:TemplateActor['kind']) {
  const versionId=z.string().uuid().parse(getRouterParam(event,'versionId'))
  const context=await prepareTemplateAction(event,kind,true)
  return copyTemplateVersion(versionId,await readBody(event),context)
}
