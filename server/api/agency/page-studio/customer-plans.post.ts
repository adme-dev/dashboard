import { handleCustomerPlansOperator } from '~~/server/utils/pageStudio/customerPlansOperatorHttp'

export default eventHandler(event => handleCustomerPlansOperator(event, 'POST'))
