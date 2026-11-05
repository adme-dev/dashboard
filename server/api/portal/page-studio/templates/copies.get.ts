import { defineEventHandler } from 'h3'
import { templateCopyRecoveryHandler } from '~~/server/utils/pageStudio/templateCopyRecovery'
export default defineEventHandler(event => templateCopyRecoveryHandler(event, 'portal'))
