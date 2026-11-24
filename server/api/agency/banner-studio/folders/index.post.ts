import { newFolder, requireFolderEditor, saveBannerFolder } from '~~/server/utils/banner/folderManagement'

export default defineEventHandler(async event => {
  await requireFolderEditor(event)
  const input = await readValidatedBody(event, newFolder.parse)
  return saveBannerFolder(input.id, input)
})
