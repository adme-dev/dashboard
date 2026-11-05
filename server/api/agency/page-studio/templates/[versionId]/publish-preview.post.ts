import { defineEventHandler } from 'h3'
import { publishTemplatePreviewHandler } from '~~/server/utils/pageStudio/templatePreviewHttp'
export default defineEventHandler(publishTemplatePreviewHandler)
