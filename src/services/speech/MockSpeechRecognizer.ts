import type { AppFeature, VoiceInteractionContext } from '@/models'
import type {
  MicPermissionState,
  ScriptableRecognizer,
  SpeechCapture,
  SpeechErrorCode,
  SpeechRecognitionHandlers,
} from '../interfaces'

/** A canned "what the user said" used by the mock recognizer. */
export interface MockScenario {
  id: string
  label: string
  /** Features where this scenario is a natural example. */
  features: AppFeature[]
  /** Transcript to "hear"; ignored when `error` is set. */
  transcript?: (ctx: VoiceInteractionContext, name: (id?: string) => string) => string
  error?: SpeechErrorCode
}

export const DEFAULT_SCENARIOS: MockScenario[] = [
  {
    id: 'grocery-add',
    label: 'Add groceries',
    features: ['groceries', 'home'],
    transcript: () => 'Add yogurt, rice, and oranges to the grocery list',
  },
  {
    id: 'calendar-add',
    label: 'Add appointment',
    features: ['calendar', 'home'],
    transcript: (ctx, name) => `Add a dentist appointment for ${ctx.memberId ? name(ctx.memberId) : 'Jaime'} tomorrow at two`,
  },
  {
    id: 'message-send',
    label: 'Send message',
    features: ['messages', 'home'],
    transcript: () => 'Send everyone a message that dinner is at six tonight',
  },
  {
    id: 'reminder-add',
    label: 'Set reminder',
    features: ['messages', 'home'],
    transcript: (ctx, name) => `Remind ${ctx.memberId ? name(ctx.memberId) : 'Liam'} to bring soccer cleats tomorrow`,
  },
  {
    id: 'note-add',
    label: 'Add note',
    features: ['messages'],
    transcript: () => 'Add a note that library books are due Monday',
  },
  {
    id: 'chore-complete',
    label: 'Complete chore',
    features: ['chores', 'home'],
    transcript: () => "Mark Lumen's set the table as complete",
  },
  { id: 'unclear', label: 'Unclear request', features: [], transcript: () => 'Add practice tomorrow' },
  { id: 'no-speech', label: 'No speech', features: [], error: 'no-speech' },
  { id: 'denied', label: 'Mic blocked', features: [], error: 'permission-denied' },
  { id: 'network', label: 'Network down', features: [], error: 'network' },
]

export interface MockRecognizerOptions {
  scenarios?: MockScenario[]
  /** Resolve a member id to a spoken name. */
  nameOf?: (id?: string) => string
  /** ms before the first word is "heard". */
  startDelayMs?: number
  /** ms between interim words. */
  wordDelayMs?: number
  /** ms between the last word and the final result. */
  finalDelayMs?: number
}

/**
 * Development recognizer: no microphone, no network. It "hears" a scripted
 * phrase chosen from the activation context, streaming interim words so the
 * UI behaves exactly as it would with a real engine.
 */
export class MockSpeechRecognizer implements ScriptableRecognizer {
  readonly id = 'mock'
  private readonly scenarioList: MockScenario[]
  private readonly nameOf: (id?: string) => string
  private readonly startDelay: number
  private readonly wordDelay: number
  private readonly finalDelay: number
  private timers: ReturnType<typeof setTimeout>[] = []
  private queued: string | undefined
  private rotation = new Map<AppFeature, number>()
  private heard = ''
  private handlers: SpeechRecognitionHandlers | undefined

  constructor(opts: MockRecognizerOptions = {}) {
    this.scenarioList = opts.scenarios ?? DEFAULT_SCENARIOS
    this.nameOf = opts.nameOf ?? ((id) => (id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Family'))
    this.startDelay = opts.startDelayMs ?? 700
    this.wordDelay = opts.wordDelayMs ?? 170
    this.finalDelay = opts.finalDelayMs ?? 450
  }

  isSupported(): boolean {
    return true
  }

  scenarios(context: VoiceInteractionContext) {
    const relevant = this.scenarioList.filter((s) => s.features.includes(context.feature) || s.features.length === 0)
    return (relevant.length ? relevant : this.scenarioList).map(({ id, label }) => ({ id, label }))
  }

  queueScenario(id: string): void {
    this.queued = id
  }

  start(handlers: SpeechRecognitionHandlers, hint?: VoiceInteractionContext): void {
    this.abort()
    this.handlers = handlers
    const scenario = this.pick(hint)
    const clear = (ms: number, fn: () => void) => this.timers.push(setTimeout(fn, ms))

    if (scenario.error) {
      clear(this.startDelay + this.finalDelay + 300, () => this.fail(scenario.error!))
      return
    }

    const text = scenario.transcript!(hint ?? fallbackContext, this.nameOf)
    const words = text.split(' ')
    words.forEach((_, i) => {
      clear(this.startDelay + i * this.wordDelay, () => {
        this.heard = words.slice(0, i + 1).join(' ')
        handlers.onInterim(this.heard)
      })
    })
    clear(this.startDelay + words.length * this.wordDelay + this.finalDelay, () => this.deliver(text))
  }

  stop(): void {
    // "Done talking": deliver whatever has been heard, or report silence.
    const handlers = this.handlers
    const text = this.heard
    this.clearTimers()
    this.handlers = undefined
    if (!handlers) return
    if (text) handlers.onFinal(text)
    else handlers.onError('no-speech')
  }

  abort(): void {
    this.clearTimers()
    this.handlers = undefined
    this.heard = ''
  }

  private pick(ctx?: VoiceInteractionContext): MockScenario {
    if (this.queued) {
      const forced = this.scenarioList.find((s) => s.id === this.queued)
      this.queued = undefined
      if (forced) return forced
    }
    const feature = ctx?.feature ?? 'home'
    const pool = this.scenarioList.filter((s) => s.features.includes(feature))
    const choices = pool.length ? pool : this.scenarioList.filter((s) => s.features.includes('home'))
    const n = this.rotation.get(feature) ?? 0
    this.rotation.set(feature, n + 1)
    return choices[n % choices.length]!
  }

  private deliver(text: string): void {
    const h = this.handlers
    this.handlers = undefined
    this.heard = ''
    h?.onFinal(text)
  }

  private fail(code: SpeechErrorCode): void {
    const h = this.handlers
    this.handlers = undefined
    this.heard = ''
    h?.onError(code)
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout)
    this.timers = []
  }
}

const fallbackContext: VoiceInteractionContext = { feature: 'home', route: '/', origin: 'global-mic' }

/** Capture stub for the mock pipeline; the permission outcome is configurable for tests. */
export class MockSpeechCapture implements SpeechCapture {
  constructor(private state: MicPermissionState = 'granted') {}
  setState(state: MicPermissionState) {
    this.state = state
  }
  async permission() {
    return this.state
  }
  async request() {
    return this.state === 'prompt' ? 'granted' : this.state
  }
}
