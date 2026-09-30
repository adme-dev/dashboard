import { defineEventHandler } from 'h3'
import { customerSetupHandler } from '~~/server/utils/pageStudio/customerSignupHttp'

export default defineEventHandler(customerSetupHandler)
