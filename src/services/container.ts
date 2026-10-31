/**
 * Composition root for services. This is the ONE place that picks concrete
 * implementations; swap a line here to point a feature at a real backend.
 */

import { createSeedData } from '@/data/seed'
import type { ServiceContainer, SpeechCapture, SpeechFeedback, SpeechRecognizer } from './interfaces'
import { DefaultActionValidator } from './intent/DefaultActionValidator'
import { RepositoryCommandExecutor } from './intent/RepositoryCommandExecutor'
import { RuleBasedIntentInterpreter } from './intent/RuleBasedIntentInterpreter'
import {
  MockCalendarRepository,
  MockChoreRepository,
  MockFamilyRepository,
  MockGroceryRepository,
  MockMessageRepository,
  MockPhotoRepository,
  MockWeatherService,
} from './mock/repositories'
import { type Persistence, noPersistence } from './mock/persistence'
import { BrowserSpeechCapture, BrowserSpeechRecognizer, BrowserSpeechFeedback } from './speech/BrowserSpeech'
import { MockSpeechCapture, MockSpeechRecognizer, type MockRecognizerOptions } from './speech/MockSpeechRecognizer'

export type SpeechProvider = 'mock' | 'browser'

export interface MockServiceOptions {
  now?: () => Date
  persistence?: Persistence
  speech?: SpeechProvider
  /** Override pieces (tests). */
  recognizer?: SpeechRecognizer
  capture?: SpeechCapture
  feedback?: SpeechFeedback
  mockRecognizer?: MockRecognizerOptions
}

export function createMockServices(opts: MockServiceOptions = {}): ServiceContainer {
  const now = opts.now ?? (() => new Date())
  const persistence = opts.persistence ?? noPersistence
  const seed = createSeedData(now())
  const mockOpts = { now, persistence }

  const family = new MockFamilyRepository(seed, mockOpts)
  const calendar = new MockCalendarRepository(seed, mockOpts)
  const groceries = new MockGroceryRepository(seed, mockOpts)
  const chores = new MockChoreRepository(seed, mockOpts)
  const messages = new MockMessageRepository(seed, mockOpts)
  const photos = new MockPhotoRepository(seed, mockOpts)

  const speech = opts.speech ?? 'mock'
  const nameOf = (id?: string) => seed.members.find((m) => m.id === id)?.name ?? 'Family'
  const recognizer: SpeechRecognizer =
    opts.recognizer ?? (speech === 'browser' ? new BrowserSpeechRecognizer() : new MockSpeechRecognizer({ nameOf, ...opts.mockRecognizer }))
  const capture: SpeechCapture = opts.capture ?? (speech === 'browser' ? new BrowserSpeechCapture() : new MockSpeechCapture())

  return {
    family,
    calendar,
    groceries,
    chores,
    messages,
    photos,
    weather: new MockWeatherService(now),
    capture,
    recognizer,
    interpreter: new RuleBasedIntentInterpreter(),
    validator: new DefaultActionValidator({ groceries, chores, calendar, messages, now }),
    executor: new RepositoryCommandExecutor({ groceries, calendar, chores, messages, now }),
    feedback: opts.feedback ?? new BrowserSpeechFeedback(),
    // The app shell replaces this with a router-backed implementation (see app/navigator.ts).
    navigation: { go: async () => {} },
    now,
  }
}

// ── Registry: stores resolve services here (they run outside component setup) ──

let current: ServiceContainer | undefined

export function setServices(container: ServiceContainer): void {
  current = container
}

export function getServices(): ServiceContainer {
  if (!current) throw new Error('Services not initialised. Call setServices() before using stores.')
  return current
}
