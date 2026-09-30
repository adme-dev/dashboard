import { defineEventHandler } from 'h3'
import { customerPreviewHandler } from '~~/server/utils/pageStudio/customerDashboardHttp'

export default defineEventHandler(customerPreviewHandler)
