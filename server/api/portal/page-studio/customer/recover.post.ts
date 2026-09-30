import { defineEventHandler } from 'h3'
import { customerRecoveryHandler } from '~~/server/utils/pageStudio/customerDashboardHttp'

export default defineEventHandler(customerRecoveryHandler)
