import { defineEventHandler } from 'h3'
import { customerRequestHandler } from '~~/server/utils/pageStudio/customerSignupHttp'

export default defineEventHandler(customerRequestHandler)
