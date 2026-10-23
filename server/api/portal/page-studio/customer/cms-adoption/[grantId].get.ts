import { handleCustomerAdoptionHttp } from '~~/server/utils/pageStudio/customerAdoptionHttp'
export default defineEventHandler(event => handleCustomerAdoptionHttp(event, 'GET'))
