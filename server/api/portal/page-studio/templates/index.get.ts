import { defineEventHandler } from 'h3'
import { templateCatalogueHandler } from '~~/server/utils/pageStudio/templateCatalogueHttp'

export default defineEventHandler(event => templateCatalogueHandler(event, 'portal'))
