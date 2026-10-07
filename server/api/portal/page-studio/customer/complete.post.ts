import { defineEventHandler } from 'h3'
import { customerCompleteHandler } from '~~/server/utils/pageStudio/customerSignupHttp'

export default defineEventHandler(customerCompleteHandler)
