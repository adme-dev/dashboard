import { defineEventHandler } from 'h3'
import { handleImageBilling } from '~~/server/utils/pageStudio/imageBillingHttp'

export default defineEventHandler(event => handleImageBilling(event, 'catalog'))
