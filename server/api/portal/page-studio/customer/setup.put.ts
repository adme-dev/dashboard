import { defineEventHandler } from 'h3'
import { customerSaveHandler } from '~~/server/utils/pageStudio/customerSignupHttp'

export default defineEventHandler(customerSaveHandler)
