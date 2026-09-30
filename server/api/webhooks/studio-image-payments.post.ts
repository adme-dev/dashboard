import { defineEventHandler } from 'h3'
import { handleImagePaymentWebhook } from '~~/server/utils/pageStudio/imagePaymentWebhook'

export default defineEventHandler(handleImagePaymentWebhook)
