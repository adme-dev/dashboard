import { defineEventHandler } from 'h3'
import { templatePreviewHandler } from '~~/server/utils/pageStudio/templatePreviewHttp'
export default defineEventHandler(event => templatePreviewHandler(event, 'agency'))
