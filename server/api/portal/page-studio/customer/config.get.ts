import { defineEventHandler } from 'h3'
import { customerConfigHandler } from '~~/server/utils/pageStudio/customerSignupHttp'

export default defineEventHandler(customerConfigHandler)
