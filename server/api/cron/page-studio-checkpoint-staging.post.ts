import { createHash, timingSafeEqual } from 'node:crypto'
import { createError, eventHandler, getHeader } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { dispatchCheckpointStaging } from '~~/server/utils/pageStudio/checkpointStagingDispatcher'

/** Only retained checkpoint jobs select scope and originating authority. The cron
 * credential permits dispatch, never a replacement actor or caller-chosen site. */
export default eventHandler(async (event) => {
  const env = (event.context.cloudflare?.env ?? {}) as Record<string, unknown>
  const expected = Object.prototype.hasOwnProperty.call(env, 'CRON_SECRET') ? env.CRON_SECRET : process.env.CRON_SECRET
  const supplied = getHeader(event, 'x-cron-secret')
  if (typeof expected !== 'string' || !expected || !supplied
    || Buffer.byteLength(expected, 'utf8') > 256 || Buffer.byteLength(supplied, 'utf8') > 256
    || !timingSafeEqual(createHash('sha256').update(expected).digest(), createHash('sha256').update(supplied).digest())) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  try {
    // Await the whole bounded batch. Claim/settlement commits never retry after
    // an uncertain result, and private RPC remains outside those transactions.
    return { ok: true, ...await dispatchCheckpointStaging(env, { transaction: transactionWithoutRetry }) }
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Checkpoint staging temporarily unavailable' })
  }
})
