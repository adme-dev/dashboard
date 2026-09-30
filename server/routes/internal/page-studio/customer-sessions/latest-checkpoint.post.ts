import { defineEventHandler } from 'h3'
import { customerEditorSessionHandler } from '~~/server/utils/pageStudio/customerEditorSessionHttp'

export default defineEventHandler(event => customerEditorSessionHandler(event, 'latest-checkpoint'))
