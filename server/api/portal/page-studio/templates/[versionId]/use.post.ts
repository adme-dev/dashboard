import { defineEventHandler } from 'h3'
import { templateCopyHandler } from '~~/server/utils/pageStudio/templateCopyHttp'
export default defineEventHandler(event => templateCopyHandler(event, 'portal'))
