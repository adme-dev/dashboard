import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import {
  getGodModeRouteAuditState,
  registerGodModeMutationFamily
} from '~~/server/utils/godMode/featureGate'

const CHAT_MESSAGES = /^\/api\/agency\/ai\/chat\/conversations\/[^/]+\/messages$/

/** Register only the chat route whose tool calls are claimed by the Task 5 execution ledger. */
export function registerGodModeChatMutationFamily(): () => void {
  return registerGodModeMutationFamily({
    family: 'ai-chat-direct-execution',
    method: 'POST',
    matchesPath: path => CHAT_MESSAGES.test(path),
    prepare: async event => {
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
}
