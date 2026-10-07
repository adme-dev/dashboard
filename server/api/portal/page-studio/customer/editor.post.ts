import { defineEventHandler } from 'h3'
import { customerEditorLaunchHandler } from '~~/server/utils/pageStudio/customerEditorLaunchHttp'

export default defineEventHandler(customerEditorLaunchHandler)
