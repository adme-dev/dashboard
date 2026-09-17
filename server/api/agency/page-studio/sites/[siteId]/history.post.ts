import { handlePageStudioHistory } from '~~/server/utils/pageStudio/draftHistoryHttp'

export default eventHandler(event => handlePageStudioHistory(event, 'agency', 'POST'))
