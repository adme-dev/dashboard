import { defineEventHandler } from 'h3'
import { templateRegistrationHandler } from '~~/server/utils/pageStudio/templateRegistrationHttp'
export default defineEventHandler(templateRegistrationHandler)
