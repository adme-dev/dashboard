import { handleCustomerPublishing } from '~~/server/utils/pageStudio/customerPublishing'

export default eventHandler(event => handleCustomerPublishing(event, 'activate'))
