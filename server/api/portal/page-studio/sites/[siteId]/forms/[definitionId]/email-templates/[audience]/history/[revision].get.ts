import { handleEmailTemplate } from '~~/server/utils/pageStudio/emailTemplatesHttp'

export default defineEventHandler(event => handleEmailTemplate(event, 'HISTORY_VERSION'))
