import { defineEventHandler } from 'h3'
import { customerVerifyHandler } from '~~/server/utils/pageStudio/customerSignupHttp'

export default defineEventHandler(customerVerifyHandler)
