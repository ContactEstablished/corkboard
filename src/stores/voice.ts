import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Clarification, ProposedAction, VoiceCommand, VoiceInteractionContext } from '@/models'
import { getServices } from '@/services/container'
import { type MicPermissionState, type SpeechErrorCode, isScriptable } from '@/services/interfaces'
import { refreshAfterAction } from './bootstrap'
import { useFamilyStore } from './family'
import { usePreferencesStore } from './preferences'

export type VoiceState =
  | 'closed'
  | 'requesting-permission'
  | 'listening'
  | 'processing'
  | 'clarifying'
  | 'reviewing'
  | 'executing'
  | 'success'
  | 'error'

/** Allowed moves. Anything else is ignored, which makes double taps harmless. */
export const VOICE_TRANSITIONS: Record<VoiceState, readonly VoiceState[]> = {
  'closed': ['requesting-permission'],
  'requesting-permission': ['listening', 'error', 'closed'],
  'listening': ['processing', 'error', 'closed', 'requesting-permission'],
  'processing': ['reviewing', 'clarifying', 'error', 'closed'],
  'clarifying': ['processing', 'requesting-permission', 'closed'],
  'reviewing': ['executing', 'requesting-permission', 'closed'],
  'executing': ['success', 'error'], // a commit in flight can't be cancelled
  'success': ['closed'],
  'error': ['requesting-permission', 'reviewing', 'closed'],
}

export type VoiceErrorCode = SpeechErrorCode | 'unclear' | 'invalid' | 'execution-failed'

export interface VoiceError {
  code: VoiceErrorCode
  title: string
  message: string
  retryable: boolean
  /** What "Retry" does: listen again, or re-attempt the confirmed action. */
  retry: 'listen' | 'execute'
}

const ERROR_COPY: Record<SpeechErrorCode, Omit<VoiceError, 'code' | 'retry'>> = {
  'permission-denied': { title: 'Microphone blocked', message: 'Family Hub needs microphone access for voice. Allow it in the device settings, then try again.', retryable: true },
  'unsupported': { title: 'Voice unavailable', message: "Speech recognition isn't available on this device or browser.", retryable: false },
  'no-speech': { title: "I didn't hear anything", message: 'Tap Retry and speak after the mic starts listening.', retryable: true },
  'timeout': { title: 'That took too long', message: 'No speech was heard in time. Try again.', retryable: true },
  'network': { title: 'Speech service unreachable', message: 'Check the Wi-Fi connection, then retry.', retryable: true },
  'aborted': { title: 'Stopped', message: 'Listening was interrupted.', retryable: true },
  'unknown': { title: 'Something went wrong', message: "I couldn't process that. Please try again.", retryable: true },
}

export const LISTEN_TIMEOUT_MS = 15_000
export const SUCCESS_AUTOCLOSE_MS = 1_800
/** Navigation and dictation have nothing to read afterwards, so they close sooner. */
export const QUICK_CLOSE_MS = 700

export type MicVisualState = 'idle' | 'ready' | 'listening' | 'processing' | 'permission' | 'confirm' | 'success' | 'error'

export interface VoiceOpenOptions {
  /** Receives the confirmed text when the mic was opened to dictate into a form field. */
  onDictation?: (text: string) => void
}

export const useVoiceStore = defineStore('voice', () => {
  const state = ref<VoiceState>('closed')
  const context = ref<VoiceInteractionContext | null>(null)
  const interim = ref('')
  const transcript = ref('')
  const command = ref<VoiceCommand | null>(null)
  const proposal = ref<ProposedAction | null>(null)
  const clarification = ref<Clarification | null>(null)
  const error = ref<VoiceError | null>(null)
  const resultMessage = ref('')

  let session = 0
  let listenTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let dictationSink: ((text: string) => void) | undefined

  const isOpen = computed(() => state.value !== 'closed')

  const micVisual = computed<MicVisualState>(() => {
    switch (state.value) {
      case 'closed': return 'idle'
      case 'requesting-permission': return 'ready'
      case 'listening': return 'listening'
      case 'processing':
      case 'executing': return 'processing'
      case 'clarifying':
      case 'reviewing': return 'confirm'
      case 'success': return 'success'
      case 'error': return error.value?.code === 'permission-denied' ? 'permission' : 'error'
    }
  })

  function go(next: VoiceState): boolean {
    if (!VOICE_TRANSITIONS[state.value].includes(next)) return false
    state.value = next
    return true
  }

  function clearTimers() {
    if (listenTimer) clearTimeout(listenTimer)
    if (closeTimer) clearTimeout(closeTimer)
    listenTimer = closeTimer = undefined
  }

  /** Spoken replies are opt-in (Speak replies in the voice window). */
  function say(text: string) {
    if (text && usePreferencesStore().speakReplies) getServices().feedback.speak(text)
  }

  function fail(code: VoiceErrorCode, retry: VoiceError['retry'] = 'listen', message?: string) {
    clearTimers()
    const copy: Omit<VoiceError, 'code' | 'retry'> =
      code in ERROR_COPY
        ? ERROR_COPY[code as SpeechErrorCode]
        : code === 'execution-failed'
          ? { title: "Couldn't save that", message: 'Nothing was changed.', retryable: true }
          : code === 'unclear'
            ? { title: "I'm not sure", message: "I'm not sure about that yet.", retryable: true }
            : { title: "I can't do that", message: 'Try saying it a different way.', retryable: true }
    error.value = { code, retry, ...copy, message: message ?? copy.message }
    go('error')
    say(error.value.message)
  }

  /** Opens the modal for `ctx` and starts listening. Ignored if already open. */
  async function open(ctx: VoiceInteractionContext, options: VoiceOpenOptions = {}): Promise<void> {
    if (state.value !== 'closed') return
    reset()
    context.value = ctx
    dictationSink = options.onDictation
    go('requesting-permission')
    await begin()
  }

  async function begin(): Promise<void> {
    const svc = getServices()
    const mine = ++session
    interim.value = transcript.value = ''
    proposal.value = null
    clarification.value = null
    command.value = null
    error.value = null

    let permission: MicPermissionState = await svc.capture.permission()
    if (mine !== session) return
    if (permission === 'prompt') permission = await svc.capture.request()
    if (mine !== session) return
    if (permission === 'unsupported' || !svc.recognizer.isSupported()) return fail('unsupported')
    if (permission === 'denied') return fail('permission-denied')

    if (!go('listening')) return
    listenTimer = setTimeout(() => {
      if (mine !== session) return
      svc.recognizer.abort()
      fail('timeout')
    }, LISTEN_TIMEOUT_MS)

    svc.recognizer.start(
      {
        onInterim: (text) => {
          if (mine === session) interim.value = text
        },
        onFinal: (text) => {
          if (mine === session) void process(text, mine)
        },
        onError: (code) => {
          if (mine !== session || code === 'aborted') return
          fail(code)
        },
      },
      context.value ?? undefined,
    )
  }

  async function process(text: string, mine: number): Promise<void> {
    if (!go('processing')) return
    if (listenTimer) clearTimeout(listenTimer)
    interim.value = text
    transcript.value = text
    const svc = getServices()
    try {
      const cmd = await svc.interpreter.interpret(text, context.value!, useFamilyStore().members, svc.now())
      if (mine !== session) return
      await resolve(cmd, mine)
    } catch {
      if (mine === session) fail('unknown')
    }
  }

  /** Validate a command: it becomes a reviewable action, a question for the user, or an explained failure. */
  async function resolve(cmd: VoiceCommand, mine: number): Promise<void> {
    const svc = getServices()
    command.value = cmd
    try {
      const result = await svc.validator.validate(cmd, context.value!, useFamilyStore().members)
      if (mine !== session) return
      if (result.ok) {
        proposal.value = result.action
        clarification.value = null
        if (!go('reviewing')) return
        if (result.action.autoRun) await confirm() // harmless navigation: no review step
      } else if (result.reason === 'clarify') {
        clarification.value = result.clarification
        if (go('clarifying')) say(result.clarification.question)
      } else {
        fail(result.reason, 'listen', result.message)
      }
    } catch {
      if (mine === session) fail('unknown')
    }
  }

  /** The user tapped one of the options of a clarifying question. */
  function answerClarification(index: number) {
    const c = clarification.value
    const cmd = command.value
    const option = c?.options[index]
    if (!c || !cmd || !option || state.value !== 'clarifying' || !go('processing')) return
    clarification.value = null
    const next: VoiceCommand = {
      ...cmd,
      intent: option.patch.intent ?? cmd.intent,
      entities: { ...cmd.entities, ...option.patch.entities },
      ambiguity: undefined,
    }
    void resolve(next, session)
  }

  /** User tapped "Stop": finish with what was heard so far. */
  function stopListening() {
    if (state.value === 'listening') getServices().recognizer.stop()
  }

  /**
   * Commit the reviewed action. Only reports success after the work actually
   * succeeded. Navigation and dictation change the UI, not data, so they are
   * handled here rather than by the data executor.
   */
  async function confirm(): Promise<void> {
    const action = proposal.value
    if (!action || state.value !== 'reviewing' || !go('executing')) return
    const mine = session
    const svc = getServices()
    const p = action.payload
    let quick = false

    if (p.kind === 'dictation') {
      dictationSink?.(p.text)
      dictationSink = undefined
      resultMessage.value = 'Got it.'
      quick = true
    } else if (p.kind === 'navigate') {
      try {
        await svc.navigation.go(p.target)
      } catch {
        if (mine === session) fail('execution-failed', 'execute', "Couldn't open that screen.")
        return
      }
      if (mine !== session) return
      resultMessage.value = `Opening ${p.target.label}`
      quick = true
    } else {
      const result = await svc.executor.execute(action)
      if (mine !== session) return
      if (!result.ok) return fail('execution-failed', 'execute', result.message)
      resultMessage.value = result.message
    }

    go('success')
    say(resultMessage.value)
    if (!quick) await refreshAfterAction()
    if (mine !== session) return // closed (or reopened) while refreshing
    closeTimer = setTimeout(close, quick ? QUICK_CLOSE_MS : SUCCESS_AUTOCLOSE_MS)
  }

  /** Touch edit of a message's recipients during review (Everyone, or specific members). */
  function setRecipients(recipients: string[] | 'everyone') {
    const a = proposal.value
    if (!a || state.value !== 'reviewing') return
    if (a.payload.kind !== 'message.send' && a.payload.kind !== 'note.add') return
    if (recipients !== 'everyone' && recipients.length === 0) return // at least one recipient
    a.payload.recipientIds = recipients
    const family = useFamilyStore()
    const label = recipients === 'everyone' ? 'Everyone' : recipients.map((id) => family.nameOf(id)).join(', ')
    const field = a.fields.find((f) => f.label === 'To')
    if (field) {
      field.value = label
      field.memberId = recipients !== 'everyone' && recipients.length === 1 ? recipients[0] : undefined
    }
  }

  /** Retry: listen again, or re-attempt a failed commit. */
  function retry() {
    if (state.value === 'error' && error.value?.retry === 'execute' && proposal.value) {
      error.value = null
      go('reviewing')
      return
    }
    if (go('requesting-permission')) void begin()
  }

  /** Dev only: force the next mock phrase and restart listening. */
  function devScenario(id: string) {
    const r = getServices().recognizer
    if (!isScriptable(r)) return
    r.queueScenario(id)
    r.abort()
    clearTimers()
    if (go('requesting-permission')) void begin()
  }

  function close() {
    if (state.value === 'executing') return
    session++
    clearTimers()
    getServices().recognizer.abort()
    getServices().feedback.cancel()
    dictationSink = undefined
    state.value = 'closed'
    reset()
  }

  function reset() {
    context.value = state.value === 'closed' ? null : context.value
    interim.value = transcript.value = resultMessage.value = ''
    command.value = null
    proposal.value = null
    clarification.value = null
    error.value = null
  }

  return {
    state, context, interim, transcript, command, proposal, clarification, error, resultMessage,
    isOpen, micVisual,
    open, close, confirm, retry, stopListening, devScenario, setRecipients, answerClarification,
  }
})
