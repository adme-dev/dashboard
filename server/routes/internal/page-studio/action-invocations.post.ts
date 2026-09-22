import { eventHandler } from 'h3'
import { handleActionInvocation } from '~~/server/utils/pageStudio/actionHttp'

export default eventHandler(event => handleActionInvocation(event))
