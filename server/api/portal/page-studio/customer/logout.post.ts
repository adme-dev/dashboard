import { defineEventHandler } from 'h3'
import { customerLogoutHandler } from '~~/server/utils/pageStudio/customerSignupHttp'

export default defineEventHandler(customerLogoutHandler)
