import type { H3Event } from 'h3'
import { readBody } from 'h3'

import { transaction } from '~~/server/utils/db'
import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import {
  getGodModeRouteAuditState,
  registerGodModeMutationFamily
} from '~~/server/utils/godMode/featureGate'
import {
  defineGodModeTransactionOperation,
  executeGodModeTransactionMutation,
  prepareGodModeTransactionMutation,
  type GodModeTransactionDb
} from '~~/server/utils/godMode/transactionCoordinator'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const CHAT_CONVERSATIONS = '/api/agency/ai/chat/conversations'
const CHAT_MESSAGES = /^\/api\/agency\/ai\/chat\/conversations\/[^/]+\/messages$/
const CHAT_CONVERSATION_CREATE = defineGodModeTransactionOperation({
  routeOrTool: `POST ${CHAT_CONVERSATIONS}`,
  mutationName: 'AI conversation creation',
  missingResultMessage: 'AI conversation creation did not produce a durable result',
  retryableInProgress: true
})

async function prepareConversationCreate(event: H3Event) {
  return await prepareGodModeTransactionMutation(event, CHAT_CONVERSATION_CREATE, {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    digestRequest: async request => await digestMcpRequestBody(await readBody(request))
  })
}

export async function executeGodModeChatConversationCreate<T extends { id: string }>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  return await executeGodModeTransactionMutation(
    event,
    CHAT_CONVERSATION_CREATE,
    transaction,
    mutate,
    replay
  )
}

/** Register chat creation and the message route whose tool calls are claimed by Task 5. */
export function registerGodModeChatMutationFamily(): () => void {
  const unregisterCreate = registerGodModeMutationFamily({
    family: 'ai-chat-conversation-create',
    method: 'POST',
    matchesPath: path => path === CHAT_CONVERSATIONS,
    prepare: prepareConversationCreate
  })
  const unregisterMessages = registerGodModeMutationFamily({
    family: 'ai-chat-direct-execution',
    method: 'POST',
    matchesPath: path => CHAT_MESSAGES.test(path),
    prepare: async (event) => {
      // Task 4 has already committed the immutable route attempt before this hook is invoked. The
      // actual mutation remains blocked until executeGodModeTool claims its stable tool-call key.
      const state = getGodModeRouteAuditState(event)
      if (!state) throw new Error('God mode route attempt is unavailable')
      return {
        strategy: 'task5-execution-ledger' as const,
        prepared: true as const,
        persistTerminal: async terminal => await appendGodModeAuditEvent(terminal)
      }
    }
  })
  return () => {
    unregisterMessages()
    unregisterCreate()
  }
}
