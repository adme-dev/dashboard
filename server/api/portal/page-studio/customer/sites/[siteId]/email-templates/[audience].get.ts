import { customerFormsHandler } from '~~/server/utils/pageStudio/customerFormsHttp'

export default defineEventHandler(event => customerFormsHandler(event, 'template', 'GET'))
