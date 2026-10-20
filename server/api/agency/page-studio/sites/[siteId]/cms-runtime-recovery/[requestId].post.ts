import { handleTransferOperatorHttp } from '~~/server/utils/pageStudio/transferControlsHttp'

export default defineEventHandler(event => handleTransferOperatorHttp(event, 'POST', 'runtime-recovery'))
