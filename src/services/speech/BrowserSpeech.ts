/**
 * Feature-detected Web Speech API adapters. Availability on the target Android
 * browser/WebView is NOT assumed: callers check `isSupported()` and fall back
 * to an error state. Raw audio is never stored; only the transcript is used.
 */

import type {
  MicPermissionState,
  SpeechCapture,
  SpeechErrorCode,
  SpeechFeedback,
  SpeechRecognitionHandlers,
  SpeechRecognizer,
} from '../interfaces'

// Minimal local typings: lib.dom doesn't ship the (still prefixed) Web Speech API.
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative }
interface SREvent { resultIndex: number; results: ArrayLike<SRResult> }
interface SRInstance {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type SRConstructor = new () => SRInstance

function recognitionCtor(): SRConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const ERROR_MAP: Record<string, SpeechErrorCode> = {
  'not-allowed': 'permission-denied',
  'service-not-allowed': 'permission-denied',
  'no-speech': 'no-speech',
  'network': 'network',
  'aborted': 'aborted',
  'language-not-supported': 'unsupported',
}

export class BrowserSpeechRecognizer implements SpeechRecognizer {
  readonly id = 'browser'
  private instance: SRInstance | undefined

  constructor(private readonly lang = 'en-US') {}

  isSupported(): boolean {
    return recognitionCtor() !== undefined
  }

  start(handlers: SpeechRecognitionHandlers): void {
    const Ctor = recognitionCtor()
    if (!Ctor) {
      handlers.onError('unsupported')
      return
    }
    this.abort()
    const r = new Ctor()
    this.instance = r
    r.lang = this.lang
    r.interimResults = true
    r.continuous = false
    r.maxAlternatives = 1

    let delivered = false
    let latest = ''
    r.onresult = (e) => {
      let text = ''
      let isFinal = false
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!
        text += res[0].transcript
        isFinal = isFinal || res.isFinal
      }
      latest = text.trim()
      if (isFinal) {
        delivered = true
        handlers.onFinal(latest)
      } else {
        handlers.onInterim(latest)
      }
    }
    r.onerror = (e) => {
      delivered = true // an error is itself the outcome; don't also report silence
      handlers.onError(ERROR_MAP[e.error] ?? 'unknown')
    }
    r.onend = () => {
      if (this.instance !== r) return
      this.instance = undefined
      if (!delivered) {
        if (latest) handlers.onFinal(latest)
        else handlers.onError('no-speech')
      }
    }
    try {
      r.start()
    } catch {
      handlers.onError('unknown')
    }
  }

  stop(): void {
    this.instance?.stop()
  }

  abort(): void {
    const r = this.instance
    this.instance = undefined
    if (!r) return
    r.onresult = r.onerror = r.onend = null
    try {
      r.abort()
    } catch {
      /* already stopped */
    }
  }
}

export class BrowserSpeechCapture implements SpeechCapture {
  async permission(): Promise<MicPermissionState> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unsupported'
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      return status.state
    } catch {
      return 'prompt' // Permissions API missing for "microphone" (e.g. some WebViews)
    }
  }

  async request(): Promise<MicPermissionState> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unsupported'
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop()) // permission probe only; nothing is recorded
      return 'granted'
    } catch (e) {
      const name = (e as DOMException).name
      return name === 'NotFoundError' || name === 'NotSupportedError' ? 'unsupported' : 'denied'
    }
  }
}

export class BrowserSpeechFeedback implements SpeechFeedback {
  speak(text: string): void {
    if (typeof speechSynthesis === 'undefined') return
    speechSynthesis.cancel()
    speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }
  cancel(): void {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }
}

export class NullSpeechFeedback implements SpeechFeedback {
  speak(): void {}
  cancel(): void {}
}
