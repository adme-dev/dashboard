import { defineEventHandler } from 'h3'
import { deliverScopedDissectionAsset } from '~~/server/utils/banner/dissectionDelivery'
export default defineEventHandler(event => deliverScopedDissectionAsset(event))
