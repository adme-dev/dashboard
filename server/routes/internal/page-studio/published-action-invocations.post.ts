import { defineEventHandler } from 'h3'
import { handlePublishedFormAction } from '~~/server/utils/pageStudio/publicActionHttp'

export default defineEventHandler(handlePublishedFormAction)
