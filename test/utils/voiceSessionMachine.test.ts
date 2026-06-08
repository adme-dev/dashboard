import { describe, expect, it } from 'vitest'
import {
  initialVoiceSession,
  voiceSessionReducer,
  type VoiceSessionState
} from '~~/app/utils/voiceSessionMachine'

const at = (overrides: Partial<VoiceSessionState>): VoiceSessionState => ({ ...initialVoiceSession, ...overrides })

describe('voiceSessionReducer', () => {
  it('START enters listening; STOP returns to idle', () => {
    const s = voiceSessionReducer(initialVoiceSession, { type: 'START' })
    expect(s.phase).toBe('listening')
    expect(voiceSessionReducer(s, { type: 'STOP' }).phase).toBe('idle')
  })

  it('a read turn: listening -> processing -> speaking -> listening', () => {
    let s = at({ phase: 'listening' })
    s = voiceSessionReducer(s, { type: 'SPEECH_CAPTURED' })
    expect(s.phase).toBe('processing')
    s = voiceSessionReducer(s, { type: 'RESPONSE', proposalId: null })
    expect(s.phase).toBe('speaking')
    s = voiceSessionReducer(s, { type: 'PLAYBACK_DONE' })
    expect(s.phase).toBe('listening')
  })

  it('a write turn: a proposal moves speaking -> awaitingConfirm on playback end', () => {
    let s = at({ phase: 'processing' })
    s = voiceSessionReducer(s, { type: 'RESPONSE', proposalId: 'p1' })
    expect(s).toMatchObject({ phase: 'speaking', pendingProposalId: 'p1' })
    s = voiceSessionReducer(s, { type: 'PLAYBACK_DONE' })
    expect(s.phase).toBe('awaitingConfirm')
  })

  it('affirmative confirm -> confirming -> listening on CONFIRM_DONE', () => {
    let s = at({ phase: 'awaitingConfirm', pendingProposalId: 'p1' })
    s = voiceSessionReducer(s, { type: 'CONFIRM_INTENT', intent: 'affirmative' })
    expect(s.phase).toBe('confirming')
    s = voiceSessionReducer(s, { type: 'CONFIRM_DONE' })
    expect(s).toMatchObject({ phase: 'listening', pendingProposalId: null })
  })

  it('negative confirm cancels the proposal and re-arms listening', () => {
    const s = voiceSessionReducer(at({ phase: 'awaitingConfirm', pendingProposalId: 'p1' }), { type: 'CONFIRM_INTENT', intent: 'negative' })
    expect(s).toMatchObject({ phase: 'listening', pendingProposalId: null })
  })

  it('ambiguous re-prompts up to twice, then gives up (cancels)', () => {
    let s = at({ phase: 'awaitingConfirm', pendingProposalId: 'p1' })
    s = voiceSessionReducer(s, { type: 'CONFIRM_INTENT', intent: 'ambiguous' })
    expect(s).toMatchObject({ phase: 'awaitingConfirm', repromptCount: 1 })
    s = voiceSessionReducer(s, { type: 'CONFIRM_INTENT', intent: 'ambiguous' })
    expect(s).toMatchObject({ phase: 'awaitingConfirm', repromptCount: 2 })
    s = voiceSessionReducer(s, { type: 'CONFIRM_INTENT', intent: 'ambiguous' })
    expect(s).toMatchObject({ phase: 'listening', pendingProposalId: null })
  })

  it('stop intent during confirm ends the session', () => {
    const s = voiceSessionReducer(at({ phase: 'awaitingConfirm', pendingProposalId: 'p1' }), { type: 'CONFIRM_INTENT', intent: 'stop' })
    expect(s.phase).toBe('idle')
  })

  it('TIMEOUT while awaiting confirm cancels the proposal', () => {
    const s = voiceSessionReducer(at({ phase: 'awaitingConfirm', pendingProposalId: 'p1' }), { type: 'TIMEOUT' })
    expect(s).toMatchObject({ phase: 'listening', pendingProposalId: null })
  })

  it('BARGE_IN only interrupts while speaking', () => {
    expect(voiceSessionReducer(at({ phase: 'speaking', pendingProposalId: 'p1' }), { type: 'BARGE_IN' }))
      .toMatchObject({ phase: 'listening', pendingProposalId: null })
    expect(voiceSessionReducer(at({ phase: 'listening' }), { type: 'BARGE_IN' }).phase).toBe('listening')
  })

  it('ERROR surfaces a message and re-arms (or idles if already idle)', () => {
    expect(voiceSessionReducer(at({ phase: 'processing' }), { type: 'ERROR', message: 'boom' }))
      .toMatchObject({ phase: 'listening', error: 'boom', pendingProposalId: null })
    expect(voiceSessionReducer(initialVoiceSession, { type: 'ERROR', message: 'boom' }).phase).toBe('idle')
  })
})
