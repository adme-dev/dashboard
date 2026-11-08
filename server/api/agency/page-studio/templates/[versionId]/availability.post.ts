import { templateAvailabilityHandler } from '~~/server/utils/pageStudio/templateAvailabilityHttp'

export default eventHandler(event => templateAvailabilityHandler(event, true))
