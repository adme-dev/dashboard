import { requireRole } from '~~/server/utils/auth'
import { embedAllFinancialSnapshots } from '~~/server/utils/financialEmbedder'

export default eventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])

  const body = await readBody(event) || {}
  const period = body.period as string | undefined
  const types = body.types as string[] | undefined

  const result = await embedAllFinancialSnapshots(event, period, types)

  return result
})
