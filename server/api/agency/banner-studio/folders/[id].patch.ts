import { editFolder, folderId, requireFolderEditor, saveBannerFolder } from '~~/server/utils/banner/folderManagement'

export default defineEventHandler(async event => {
  await requireFolderEditor(event)
  const { id } = await getValidatedRouterParams(event, params => ({ id: folderId.parse(params.id) }))
  const input = await readValidatedBody(event, editFolder.parse)
  return saveBannerFolder(id, input)
})
