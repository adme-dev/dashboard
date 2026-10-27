import { proposeArtwork } from '~~/server/utils/banner/artwork'

export default defineEventHandler(async event => proposeArtwork(event, await readBody(event), 'generation'))
