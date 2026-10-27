import { proposeLetteringRepair } from '~~/server/utils/banner/artwork'

export default defineEventHandler(async event => proposeLetteringRepair(event, await readBody(event)))
