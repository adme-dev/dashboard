import { defineEventHandler } from 'h3'
import { handlePageStudioBusinessContent } from '~~/server/utils/pageStudio/businessContentHttp'

export default defineEventHandler(event => handlePageStudioBusinessContent(event, 'portal', 'GET'))
