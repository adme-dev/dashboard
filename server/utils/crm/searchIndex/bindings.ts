import type { H3Event } from 'h3'

import type { CrmSearchIndexQueueMessage } from '~~/shared/crmSearchIndexProtocol'
import {
  parseCrmSearchConfirmationKeyring,
  type CrmSearchConfirmationKeyring
} from '~~/server/utils/crm/searchIndex/confirmation'

export const CRM_SEARCH_INDEX_QUEUE_BINDING = 'CRM_SEARCH_INDEX_QUEUE' as const
export const CRM_SEARCH_CONFIRMATION_KEYRING_BINDING
  = 'CRM_SEARCH_CONFIRMATION_KEYRING' as const

export interface CrmSearchIndexQueueProducer {
  send(
    message: CrmSearchIndexQueueMessage,
    options: { contentType: 'json' }
  ): Promise<unknown>
}

/**
 * Resolves only the dedicated CRM search producer. A generic jobs queue is not
 * a compatible fallback because its consumer does not implement this protocol.
 */
export function resolveCrmSearchIndexQueueProducer(
  event: H3Event
): CrmSearchIndexQueueProducer | null {
  const env = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  } | undefined)?.cloudflare?.env
  if (!env || !Object.prototype.hasOwnProperty.call(env, CRM_SEARCH_INDEX_QUEUE_BINDING)) {
    return null
  }

  const candidate = env[CRM_SEARCH_INDEX_QUEUE_BINDING]
  if (
    (!candidate || typeof candidate !== 'object')
    && typeof candidate !== 'function'
  ) return null

  try {
    const send = (candidate as { send?: unknown }).send
    if (typeof send !== 'function') return null
    return {
      async send(message, options) {
        return await Reflect.apply(send, candidate, [message, options])
      }
    }
  } catch {
    return null
  }
}

/** A malformed deployed secret binding never falls back to process state. */
export function resolveCrmSearchConfirmationKeyring(
  event: H3Event
): CrmSearchConfirmationKeyring | null {
  const env = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  } | undefined)?.cloudflare?.env
  if (env && Object.prototype.hasOwnProperty.call(
    env,
    CRM_SEARCH_CONFIRMATION_KEYRING_BINDING
  )) {
    const value = env[CRM_SEARCH_CONFIRMATION_KEYRING_BINDING]
    return typeof value === 'string' ? parseCrmSearchConfirmationKeyring(value) : null
  }
  return parseCrmSearchConfirmationKeyring(
    process.env[CRM_SEARCH_CONFIRMATION_KEYRING_BINDING]
  )
}
