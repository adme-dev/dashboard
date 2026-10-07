import { handleFormRecipients } from '~~/server/utils/pageStudio/formRecipientsHttp'

export default defineEventHandler(event => handleFormRecipients(event, 'GET'))
