import { defineEventHandler } from 'h3'
import { customerDashboardHandler } from '~~/server/utils/pageStudio/customerDashboardHttp'

export default defineEventHandler(customerDashboardHandler)
