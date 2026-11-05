import { defineEventHandler } from 'h3'
import { customerTemplateEditorHandler } from '~~/server/utils/pageStudio/customerTemplateCopies'
export default defineEventHandler(customerTemplateEditorHandler)
