import type { ConfirmIntent } from './voiceConfirm'

/** Lifecycle of one hands-free voice session. Pure reducer — the composable owns the side effects. */
export type VoicePhase =
  | 'idle'            // no session
  | 'listening'       // mic armed, capturing a turn (or a confirm utterance)
  | 'processing'      // turn sent to the agent, awaiting reply
  | 'speaking'        // playing the assistant's TTS reply
  | 'awaitingConfirm' // a write was proposed; waiting for a spoken confirm/cancel
  | 'confirming'      // executing the confirmed write

export interface VoiceSessionState {
  phase: VoicePhase
  pendingProposalId: string | null
  repromptCount: number
  error: string | null
}

export const initialVoiceSession: VoiceSessionState = {
  phase: 'idle',
  pendingProposalId: null,
  repromptCount: 0,
  error: null,
}

export type VoiceEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'SPEECH_CAPTURED' }
  | { type: 'RESPONSE', proposalId: string | null }
  | { type: 'PLAYBACK_DONE' }
  | { type: 'BARGE_IN' }
  | { type: 'CONFIRM_INTENT', intent: ConfirmIntent }
  | { type: 'CONFIRM_DONE' }
  | { type: 'TIMEOUT' }
  | { type: 'ERROR', message: string }

const MAX_REPROMPTS = 2

export function voiceSessionReducer(s: VoiceSessionState, e: VoiceEvent): VoiceSessionState {
  switch (e.type) {
    case 'START':
      return { ...initialVoiceSession, phase: 'listening' }
    case 'STOP':
      return { ...initialVoiceSession, phase: 'idle' }
    case 'ERROR':
      return { ...s, error: e.message, pendingProposalId: null, phase: s.phase === 'idle' ? 'idle' : 'listening' }
    case 'BARGE_IN':
      return s.phase === 'speaking'
        ? { ...s, phase: 'listening', pendingProposalId: null, repromptCount: 0 }
        : s
    case 'SPEECH_CAPTURED':
      return s.phase === 'listening' ? { ...s, phase: 'processing', error: null } : s
    case 'RESPONSE':
      return s.phase === 'processing' ? { ...s, phase: 'speaking', pendingProposalId: e.proposalId } : s
    case 'PLAYBACK_DONE':
      if (s.phase !== 'speaking') return s
      return s.pendingProposalId
        ? { ...s, phase: 'awaitingConfirm', repromptCount: 0 }
        : { ...s, phase: 'listening' }
    case 'CONFIRM_INTENT':
      if (s.phase !== 'awaitingConfirm') return s
      switch (e.intent) {
        case 'affirmative':
          return { ...s, phase: 'confirming' }
        case 'negative':
          return { ...s, phase: 'listening', pendingProposalId: null, repromptCount: 0 }
        case 'stop':
          return { ...initialVoiceSession, phase: 'idle' }
        case 'ambiguous':
          return s.repromptCount >= MAX_REPROMPTS
            ? { ...s, phase: 'listening', pendingProposalId: null, repromptCount: 0 }
            : { ...s, repromptCount: s.repromptCount + 1 }
      }
      return s
    case 'CONFIRM_DONE':
      return s.phase === 'confirming'
        ? { ...s, phase: 'listening', pendingProposalId: null, repromptCount: 0 }
        : s
    case 'TIMEOUT':
      return s.phase === 'awaitingConfirm'
        ? { ...s, phase: 'listening', pendingProposalId: null, repromptCount: 0 }
        : s
    default:
      return s
  }
}
