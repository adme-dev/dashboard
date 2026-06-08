import { classifyConfirmUtterance } from '~~/app/utils/voiceConfirm'
import { createBargeInDetector } from '~~/app/utils/voiceBargeIn'
import {
  initialVoiceSession,
  voiceSessionReducer,
  type VoiceEvent,
  type VoiceSessionState
} from '~~/app/utils/voiceSessionMachine'
import type { AiMessage } from '~/types'

type Proposal = { proposalId: string, resolved: unknown }

interface VoiceTurnResult {
  message: AiMessage
  transcribedText: string
  audioBase64: string | null
  audioFormat: string | null
  proposedAction?: Proposal | null
}

export interface UseVoiceSessionOptions {
  /** Returns the active conversation id, creating one if needed. */
  ensureConversation: () => Promise<string | null>
  /** Push a completed user+assistant turn into the chat thread. */
  onTurn: (userText: string, assistant: AiMessage, proposedAction: Proposal | null) => void
  /** Append a short assistant note (e.g. the spoken confirm result). */
  onAssistantNote: (text: string) => void
  /** Clear the open proposal card on the last assistant message (after a spoken confirm/cancel). */
  onProposalResolved: () => void
}

const CONFIRM_TIMEOUT_MS = 15_000

/**
 * Hands-free voice session orchestrator. Wires the existing one-shot voice primitives
 * (`useVoiceChat`) and the pure decision units (confirm classifier, barge-in detector, session
 * state machine) into a continuous open-mic loop with barge-in and spoken write-confirmation.
 * All branching decisions go through the pure `voiceSessionReducer`; this composable only performs
 * the side effects (recording, playback, fetches, timers). Browser-only — verified by manual UAT.
 */
export function useVoiceSession(opts: UseVoiceSessionOptions) {
  const voice = useVoiceChat()
  const state = ref<VoiceSessionState>({ ...initialVoiceSession })

  let bargeRaf: number | null = null
  let bargeStream: MediaStream | null = null
  let bargeCtx: AudioContext | null = null
  let confirmTimer: ReturnType<typeof setTimeout> | null = null
  const detector = createBargeInDetector()

  function dispatch(e: VoiceEvent) {
    state.value = voiceSessionReducer(state.value, e)
  }

  async function start() {
    dispatch({ type: 'START' })
    void runListen()
  }

  function stop() {
    dispatch({ type: 'STOP' })
    teardown()
  }

  function teardown() {
    voice.stopRecording()
    voice.stopAudio()
    stopBargeMonitor()
    if (confirmTimer) {
      clearTimeout(confirmTimer)
      confirmTimer = null
    }
  }

  // --- One conversational turn ---------------------------------------------
  async function runListen() {
    if (state.value.phase !== 'listening') return
    const blob = await voice.startRecording() // resolves on VAD silence / max-duration
    if (state.value.phase !== 'listening') return // stopped or barged mid-record
    if (!blob) {
      if (state.value.phase === 'listening') void runListen()
      return
    }

    const convId = await opts.ensureConversation()
    if (!convId) {
      dispatch({ type: 'ERROR', message: 'No conversation' })
      return
    }

    dispatch({ type: 'SPEECH_CAPTURED' })
    try {
      const result = await voice.sendVoiceMessage(convId, blob) as VoiceTurnResult
      const proposal = result.proposedAction ?? null
      opts.onTurn(result.transcribedText, result.message, proposal)
      dispatch({ type: 'RESPONSE', proposalId: proposal?.proposalId ?? null })
      await speakThenAdvance(result.audioBase64, result.audioFormat, proposal)
    } catch {
      dispatch({ type: 'ERROR', message: voice.error.value || 'Voice turn failed' })
      void resumeAfterError()
    }
  }

  /** Play the reply (with barge-in armed); then advance to confirm or back to listening. */
  async function speakThenAdvance(
    audioBase64: string | null,
    audioFormat: string | null,
    proposal: Proposal | null
  ) {
    await playWithBargeIn(audioBase64, audioFormat)
    if (proposal && state.value.phase === 'speaking') {
      // Append a spoken hint so the user knows the exact phrase to use.
      await speakText('Say confirm to proceed, or cancel.')
    }
    if (state.value.phase !== 'speaking') return // a barge-in already moved us to listening
    dispatch({ type: 'PLAYBACK_DONE' })
    if (state.value.phase === 'awaitingConfirm') void runConfirm()
    else if (state.value.phase === 'listening') void runListen()
  }

  // --- Spoken confirmation sub-flow ----------------------------------------
  async function runConfirm() {
    if (state.value.phase !== 'awaitingConfirm') return
    armConfirmTimeout()
    const blob = await voice.startRecording()
    if (confirmTimer) {
      clearTimeout(confirmTimer)
      confirmTimer = null
    }
    if (state.value.phase !== 'awaitingConfirm') return
    if (!blob) {
      void runConfirm()
      return
    }

    const convId = await opts.ensureConversation()
    if (!convId) {
      dispatch({ type: 'ERROR', message: 'No conversation' })
      return
    }

    // Transcribe the confirm utterance by reusing the voice endpoint's STT. We only use its
    // transcript here; the classification (not the agent) decides whether to execute.
    let transcript = ''
    try {
      const r = await voice.sendVoiceMessage(convId, blob) as VoiceTurnResult
      transcript = r.transcribedText || ''
    } catch {
      transcript = ''
    }

    const intent = classifyConfirmUtterance(transcript)
    const proposalId = state.value.pendingProposalId
    dispatch({ type: 'CONFIRM_INTENT', intent })

    if (intent === 'affirmative' && proposalId) {
      await executeProposal(convId, proposalId)
    } else if (intent === 'negative') {
      opts.onProposalResolved()
      await speakText('Cancelled.')
      if (state.value.phase === 'listening') void runListen()
    } else if (intent === 'stop') {
      teardown()
    } else if (state.value.phase === 'awaitingConfirm') {
      await speakText('Sorry, say confirm to proceed, or cancel.')
      void runConfirm()
    } else {
      // gave up after the max re-prompts
      opts.onProposalResolved()
      if (state.value.phase === 'listening') void runListen()
    }
  }

  async function executeProposal(convId: string, proposalId: string) {
    try {
      const res = await $fetch<{ ok: boolean, taskId?: string, error?: string }>(
        `/api/agency/ai/chat/conversations/${convId}/confirm-action`,
        { method: 'POST', body: { proposalId } }
      )
      opts.onProposalResolved()
      const note = res.ok ? 'Done — the task has been created.' : (res.error || 'I could not complete that action.')
      opts.onAssistantNote(note)
      await speakText(note)
    } catch {
      opts.onProposalResolved()
      await speakText('Something went wrong completing that action.')
    } finally {
      dispatch({ type: 'CONFIRM_DONE' })
      if (state.value.phase === 'listening') void runListen()
    }
  }

  function armConfirmTimeout() {
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => {
      voice.cancelRecording()
      dispatch({ type: 'TIMEOUT' })
      opts.onProposalResolved()
      if (state.value.phase === 'listening') void runListen()
    }, CONFIRM_TIMEOUT_MS)
  }

  async function resumeAfterError() {
    // brief pause to avoid a tight error loop, then re-arm if still in a session
    await new Promise(resolve => setTimeout(resolve, 600))
    if (state.value.phase === 'listening') void runListen()
  }

  // --- TTS helpers ----------------------------------------------------------
  async function speakText(text: string) {
    try {
      const res = await $fetch<{ audioBase64: string, audioFormat: string } | null>(
        '/api/agency/ai/chat/speak',
        { method: 'POST', body: { text } }
      )
      if (res?.audioBase64) await playWithBargeIn(res.audioBase64, res.audioFormat)
    } catch {
      // soft-fail: the text is already shown in the thread
    }
  }

  async function playWithBargeIn(audioBase64: string | null, audioFormat: string | null) {
    if (!audioBase64) return
    await startBargeMonitor()
    try {
      await voice.playAudio(audioBase64, audioFormat || 'mp3')
    } finally {
      stopBargeMonitor()
    }
  }

  // --- Barge-in: listen for the user talking over playback ------------------
  async function startBargeMonitor() {
    stopBargeMonitor()
    detector.reset()
    try {
      bargeStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      bargeCtx = new AudioContext()
      const src = bargeCtx.createMediaStreamSource(bargeStream)
      const analyser = bargeCtx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!bargeCtx) return
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const n = data[i] / 255
          sum += n * n
        }
        const rms = Math.sqrt(sum / data.length)
        if (detector.sample(rms, Date.now())) {
          voice.stopAudio()
          dispatch({ type: 'BARGE_IN' })
          stopBargeMonitor()
          if (state.value.phase === 'listening') void runListen()
          return
        }
        bargeRaf = requestAnimationFrame(tick)
      }
      bargeRaf = requestAnimationFrame(tick)
    } catch {
      // No mic for barge-in — playback still completes normally.
    }
  }

  function stopBargeMonitor() {
    if (bargeRaf) {
      cancelAnimationFrame(bargeRaf)
      bargeRaf = null
    }
    if (bargeStream) {
      bargeStream.getTracks().forEach(t => t.stop())
      bargeStream = null
    }
    if (bargeCtx && bargeCtx.state !== 'closed') {
      bargeCtx.close().catch(() => {})
      bargeCtx = null
    }
  }

  onUnmounted(() => teardown())

  return {
    phase: computed(() => state.value.phase),
    error: computed(() => state.value.error),
    volumeLevel: voice.volumeLevel,
    isActive: computed(() => state.value.phase !== 'idle'),
    start,
    stop
  }
}
