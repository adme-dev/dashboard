import { handleFormSettings } from '~~/server/utils/pageStudio/formSettingsHttp'

export default eventHandler(event => handleFormSettings(event, 'GET'))
