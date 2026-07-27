import { closeEventDatabaseClients } from '~~/server/utils/db'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('afterResponse', async (event) => {
    await closeEventDatabaseClients(event)
  })
})
