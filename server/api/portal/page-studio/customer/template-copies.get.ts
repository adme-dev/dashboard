import { defineEventHandler } from 'h3'
import { customerTemplateCopiesHandler } from '~~/server/utils/pageStudio/customerTemplateCopies'
export default defineEventHandler(customerTemplateCopiesHandler)
