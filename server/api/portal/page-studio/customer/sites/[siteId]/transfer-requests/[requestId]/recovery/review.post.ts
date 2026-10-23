import { handleTransferReviewOwnerHttp } from '~~/server/utils/pageStudio/transferControlsHttp'

export default eventHandler(event => handleTransferReviewOwnerHttp(event))
