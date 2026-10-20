import { handleTransferOwnerHttp } from '~~/server/utils/pageStudio/transferControlsHttp'

export default eventHandler(event => handleTransferOwnerHttp(event, 'GET'))
