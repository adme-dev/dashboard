import type { H3Event } from 'h3'
import { getResponseStatus, setResponseStatus } from 'h3'

import { appendGodModeAuditEvent, type GodModeAuditEventInput } from '~~/server/utils/godMode/audit'
import {
  getGodModeRouteAuditState,
  isGodModeMutationRequest,
  markGodModeRouteFailure
} from '~~/server/utils/godMode/featureGate'
import { sendGodModeAuditTerminal } from '~~/server/utils/queue'

interface ResponseEnvelope {
  body?: unknown
}

interface TerminalAuditDependencies {
  appendGodModeAuditEvent: typeof appendGodModeAuditEvent
  setResponseStatus: typeof setResponseStatus
}

const defaultDependencies: TerminalAuditDependencies = {
  appendGodModeAuditEvent,
  setResponseStatus
}

function responseClass(status: number): string {
  if (status >= 200 && status <= 599) return `http_${Math.floor(status / 100)}xx`
  return 'http_unknown'
}

function boundedTerminalDiagnostic(error: unknown): { errorClass: string, sqlState: string | null } {
  const candidate = typeof error === 'object' && error !== null
    ? error as { name?: unknown, code?: unknown }
    : null
  const errorClass = typeof candidate?.name === 'string' && candidate.name.length > 0 && candidate.name.length <= 64
    ? candidate.name
    : typeof error
  const sqlState = typeof candidate?.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)
    ? candidate.code
    : null
  return { errorClass, sqlState }
}

function replaceWithAuditFailure(
  event: H3Event,
  response: ResponseEnvelope,
  dependencies: TerminalAuditDependencies
): void {
  dependencies.setResponseStatus(event, 503, 'God mode audit unavailable')
  response.body = {
    statusCode: 503,
    statusMessage: 'God mode audit unavailable'
  }
}

async function persistReadFallback(event: H3Event, terminal: GodModeAuditEventInput): Promise<boolean> {
  try {
    return await sendGodModeAuditTerminal(event, terminal)
  } catch {
    return false
  }
}

export async function persistGodModeTerminalAudit(
  event: H3Event,
  response: ResponseEnvelope,
  dependencies: TerminalAuditDependencies = defaultDependencies
): Promise<void> {
  const state = getGodModeRouteAuditState(event)
  if (!state) return
  if (state.terminalPromise) return await state.terminalPromise

  state.terminalPromise = (async () => {
    const status = getResponseStatus(event)
    const failed = state.handlerFailed || status >= 400
    const terminal: GodModeAuditEventInput = {
      actorUserId: state.actorUserId,
      correlationId: state.correlationId,
      sessionDigest: state.sessionDigest,
      channel: 'application',
      routeOrTool: state.routeOrTool,
      phase: failed ? 'failed' : 'succeeded',
      bypassedControls: [...state.bypassedControls],
      outcomeCode: responseClass(status),
      emergencyDisabled: state.emergencyDisabled
    }

    try {
      if (state.mutationCoordination) {
        await state.mutationCoordination.persistTerminal(terminal)
      } else {
        await dependencies.appendGodModeAuditEvent(terminal)
      }
      return
    } catch (error) {
      const diagnostic = boundedTerminalDiagnostic(error)
      console.error('[God mode audit] terminal persistence failed', {
        correlationId: state.correlationId,
        route: state.routeOrTool,
        stage: 'terminal_persistence',
        errorClass: diagnostic.errorClass,
        sqlState: diagnostic.sqlState
      })
      if (!isGodModeMutationRequest(event) && await persistReadFallback(event, terminal)) return
      replaceWithAuditFailure(event, response, dependencies)
    }
  })()

  await state.terminalPromise
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (_error, context) => {
    if (context.event) markGodModeRouteFailure(context.event)
  })
  nitroApp.hooks.hook('beforeResponse', async (event, response) => {
    await persistGodModeTerminalAudit(event, response)
  })
})
