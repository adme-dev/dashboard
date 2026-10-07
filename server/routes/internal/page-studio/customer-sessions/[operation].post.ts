import { defineEventHandler, getRouterParam } from 'h3'
import { customerEditorSessionHandler } from '~~/server/utils/pageStudio/customerEditorSessionHttp'

export default defineEventHandler(event => customerEditorSessionHandler(event, getRouterParam(event, 'operation') ?? ''))
