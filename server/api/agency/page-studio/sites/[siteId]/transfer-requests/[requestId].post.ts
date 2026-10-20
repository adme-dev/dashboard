import { handleTransferOperatorHttp } from '~~/server/utils/pageStudio/transferControlsHttp'

export default eventHandler(event => handleTransferOperatorHttp(event, 'POST', 'request'))
