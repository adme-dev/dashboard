import { defineEventHandler } from 'h3'
import { customerMeHandler } from '~~/server/utils/pageStudio/customerSignupHttp'

export default defineEventHandler(customerMeHandler)
