import { z } from 'zod'
import { setBannerFolderBinned } from '~~/server/utils/banner/folderBin'
import { editFolder, folderId, requireFolderEditor, saveBannerFolder } from '~~/server/utils/banner/folderManagement'

const change = z.union([editFolder, z.object({ binned: z.boolean() }).strict()])

export default defineEventHandler(async event => {
  await requireFolderEditor(event)
  const { id } = await getValidatedRouterParams(event, params => ({ id: folderId.parse(params.id) }))
  const input = await readValidatedBody(event, change.parse)
  if ('binned' in input) return setBannerFolderBinned(id, input.binned)
  return saveBannerFolder(id, input)
})
