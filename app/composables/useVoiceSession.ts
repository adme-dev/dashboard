import { classifyConfirmUtterance } from '~~/app/utils/voiceConfirm'
import { createBargeInDetector } from '~~/app/utils/voiceBargeIn'
import {
  initialVoiceSession,
  voiceSessionReducer,
  type VoiceEvent,
  type VoiceSessionState
} from '~~/app/utils/voiceSessionMachine'
import type { AiMessage } from '~/types'

type Proposal = { proposalId: string, resolved: unknown, toolName?: string }

// rich_confirm tools must send an explicit ack at confirm (the server gate rejects otherwise).
const RICH_CONFIRM_TOOLS = new Set(['propose_budget_change', 'propose_eom_generate'])
// Spoken confirmation copy per tool — the generic "task created" lies for non-task writes.
function confirmNote(toolName?: string): string {
  switch (toolName) {
    case 'propose_budget_change': return 'Done — the budget change has been planned for the spend review.'
    case 'propose_eom_generate': return 'Done — the end-of-month invoice run has been generated as a draft.'
    case 'propose_schedule_post': return 'Done — the post has been created.'
    case 'propose_budget_alert': return 'Done — the budget alert has been created.'
    case 'propose_knowledge_article': return 'Done — the knowledge article was drafted for review.'
    default: return 'Done — the task has been created.'
  }
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
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string; body?: unknown }
  ) => Promise<T>
  const voice = useVoiceChat()
  const state = ref<VoiceSessionState>({ ...initialVoiceSession })

  let bargeRaf: number | null = null
  let bargeStream: MediaStream | null = null
  let bargeCtx: AudioContext | null = null
  let confirmTimer: ReturnType<typeof setTimeout> | null = null
  // The full pending proposal (the state machine tracks only its id) — needed at confirm time to
  // pick the right tool's richConfirmAck + spoken note.
  let pendingProposal: Proposal | null = null
  const detector = createBargeInDetector()

  function dispatch(e: VoiceEvent) {
    state.value = voiceSessionReducer(state.value, e)
  }

  function phase(): VoiceSessionState['phase'] {
    return state.value.phase
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
    voice.cancelRecording() // discard any in-flight capture (don't resolve it with a stale blob)
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
      // A null blob WITH an error means the mic is unavailable (denied/revoked/in use): surface it
      // and stop the loop instead of tight-spinning getUserMedia. A null blob WITHOUT an error is a
      // benign empty/cancelled capture, so just re-arm.
      if (voice.error.value) {
        dispatch({ type: 'ERROR', message: voice.error.value })
        return
      }
      if (state.value.phase === 'listening') void runListen()
      return
    }

    const convId = await opts.ensureConversation()
    if (!convId) {
      dispatch({ type: 'ERROR', message: 'No conversation' })
      void resumeAfterError()
      return
    }

    dispatch({ type: 'SPEECH_CAPTURED' })
    try {
      const result = await voice.sendVoiceMessage(convId, blob)
      if (phase() !== 'processing') return // stop() fired mid-request
      const proposal = result.proposedAction ?? null
      pendingProposal = proposal
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
    if (phase() !== 'speaking') return // a barge-in already moved us to listening
    dispatch({ type: 'PLAYBACK_DONE' })
    if (phase() === 'awaitingConfirm') void runConfirm()
    else if (phase() === 'listening') void runListen()
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

    // Transcribe the confirm utterance with STT ONLY — do not run the agent on "confirm"/"cancel"
    // (that would pollute the thread and could leak a stray proposal). Classification decides.
    const transcript = await transcribe(blob)
    if (state.value.phase !== 'awaitingConfirm') return // stop()/timeout fired mid-transcribe
    const intent = classifyConfirmUtterance(transcript)
    const proposalId = state.value.pendingProposalId
    dispatch({ type: 'CONFIRM_INTENT', intent })

    if (intent === 'affirmative' && proposalId) {
      const convId = await opts.ensureConversation()
      if (!convId) {
        dispatch({ type: 'ERROR', message: 'No conversation' })
        void resumeAfterError()
        return
      }
      await executeProposal(convId, proposalId)
    } else if (intent === 'affirmative') {
      // proposalId vanished unexpectedly — don't hang in 'confirming'
      dispatch({ type: 'CONFIRM_DONE' })
      if (phase() === 'listening') void runListen()
    } else if (intent === 'negative') {
      opts.onProposalResolved()
      pendingProposal = null
      await speakText('Cancelled.')
      if (phase() === 'listening') void runListen()
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
    const toolName = pendingProposal?.toolName
    try {
      const res = await apiFetch<{ ok: boolean, taskId?: string, resultRef?: string, error?: string }>(
        `/api/agency/ai/chat/conversations/${convId}/confirm-action`,
        // rich_confirm writes (budget change) must send the ack the server gate requires.
        { method: 'POST', body: { proposalId, ...(toolName && RICH_CONFIRM_TOOLS.has(toolName) ? { richConfirmAck: true } : {}) } }
      )
      opts.onProposalResolved()
      pendingProposal = null
      const note = res.ok ? confirmNote(toolName) : (res.error || 'I could not complete that action.')
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

  // --- STT / TTS helpers ----------------------------------------------------
  async function transcribe(blob: Blob): Promise<string> {
    try {
      const fd = new FormData()
      fd.append('audio', blob)
      const r = await apiFetch<{ text: string } | null>('/api/agency/ai/chat/transcribe', { method: 'POST', body: fd })
      return r?.text || ''
    } catch {
      return ''
    }
  }

  async function speakText(text: string) {
    try {
      const res = await apiFetch<{ audioBase64: string, audioFormat: string } | null>(
        '/api/agency/ai/chat/speak',
        { method: 'POST', body: { text } }
      )
      // System utterances (hint / "Cancelled." / result) are short — play them WITHOUT barge-in
      // so they can't race the explicit re-arm below. Only the main agent reply is interruptible.
      if (res?.audioBase64) await voice.playAudio(res.audioBase64, res.audioFormat || 'mp3')
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
