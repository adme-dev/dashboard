import { defineEventHandler } from 'h3'
import { deliverBannerRasterExport } from '~~/server/utils/banner/exportDelivery'

export default defineEventHandler(event => deliverBannerRasterExport(event))
