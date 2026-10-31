/**
 * Service and repository contracts. Stores and features depend ONLY on these.
 * Implementations (mock, REST, GraphQL, native bridge…) are chosen in
 * `services/container.ts`. Every method is async so a network-backed
 * implementation can drop in without changing callers.
 */

import type {
  Achievement,
  ActionKind,
  CalendarEvent,
  Chore,
  ChoreCompletion,
  FamilyMember,
  ID,
  ISODate,
  Message,
  Photo,
  ProposedAction,
  Reminder,
  ShoppingItem,
  VoiceCommand,
  VoiceInteractionContext,
  WeatherSnapshot,
} from '@/models'

// ───────────── Data repositories ─────────────

export interface FamilyRepository {
  listMembers(): Promise<FamilyMember[]>
  updatePresence(memberId: ID, presence: FamilyMember['presence']): Promise<FamilyMember>
}

export interface CalendarRepository {
  /** Events overlapping [from, to). Recurring events are expanded into occurrences (`id` = `<seriesId>#<date>`). */
  listEvents(from: Date, to: Date): Promise<CalendarEvent[]>
  createEvent(event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent>
  /** Passing an occurrence id edits the whole series. */
  updateEvent(id: ID, patch: Partial<Omit<CalendarEvent, 'id'>>): Promise<CalendarEvent>
  /** Passing an occurrence id deletes the whole series. */
  deleteEvent(id: ID): Promise<void>
}

export interface GroceryRepository {
  listItems(): Promise<ShoppingItem[]>
  addItems(items: (Pick<ShoppingItem, 'name'> & Partial<ShoppingItem>)[], addedBy?: ID): Promise<ShoppingItem[]>
  updateItem(id: ID, patch: Partial<Omit<ShoppingItem, 'id'>>): Promise<ShoppingItem>
  removeItem(id: ID): Promise<void>
  suggestions(): Promise<string[]>
}

export interface ChoreRepository {
  listChores(): Promise<Chore[]>
  createChore(chore: Omit<Chore, 'id'>): Promise<Chore>
  updateChore(id: ID, patch: Partial<Omit<Chore, 'id'>>): Promise<Chore>
  deleteChore(id: ID): Promise<void>
  listCompletions(): Promise<ChoreCompletion[]>
  /**
   * Idempotent: completing the same chore occurrence twice returns the
   * existing record with `created: false` and awards nothing new.
   */
  recordCompletion(choreId: ID, memberId: ID, at: Date, occurrenceDate?: ISODate): Promise<{ completion: ChoreCompletion; created: boolean }>
  listAchievements(memberId?: ID): Promise<Achievement[]>
}

export interface MessageRepository {
  listMessages(): Promise<Message[]>
  sendMessage(message: Omit<Message, 'id' | 'createdAt'>): Promise<Message>
  deleteMessage(id: ID): Promise<void>
  listReminders(): Promise<Reminder[]>
  createReminder(reminder: Omit<Reminder, 'id' | 'done'>): Promise<Reminder>
  setReminderDone(id: ID, done: boolean): Promise<Reminder>
  deleteReminder(id: ID): Promise<void>
}

export interface PhotoRepository {
  listPhotos(filter?: { memberId?: ID; category?: Photo['category']; favoritesOnly?: boolean }): Promise<Photo[]>
  setFavorite(id: ID, favorite: boolean): Promise<Photo>
  setCaption(id: ID, caption: string): Promise<Photo>
}

export interface WeatherService {
  current(): Promise<WeatherSnapshot>
}

// ───────────── Speech pipeline ─────────────

export type MicPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

/** Speech capture: microphone access only. Never retains raw audio. */
export interface SpeechCapture {
  /** Non-prompting check of the current permission. */
  permission(): Promise<MicPermissionState>
  /** Prompts the user if needed. */
  request(): Promise<MicPermissionState>
}

export type SpeechErrorCode =
  | 'permission-denied'
  | 'unsupported'
  | 'no-speech'
  | 'timeout'
  | 'network'
  | 'aborted'
  | 'unknown'

export interface SpeechRecognitionHandlers {
  onInterim(text: string): void
  onFinal(text: string): void
  onError(code: SpeechErrorCode): void
}

/** Speech-to-text. Adapters: browser Web Speech API, mock, future native bridge. */
export interface SpeechRecognizer {
  readonly id: string
  isSupported(): boolean
  start(handlers: SpeechRecognitionHandlers, hint?: VoiceInteractionContext): void
  /** Stop capturing and deliver what was heard so far. */
  stop(): void
  /** Stop and discard. No handler fires afterwards. */
  abort(): void
}

/** Optional capability: recognizers that can be driven by dev scenarios. */
export interface ScriptableRecognizer extends SpeechRecognizer {
  scenarios(context: VoiceInteractionContext): { id: string; label: string }[]
  queueScenario(id: string): void
}

export function isScriptable(r: SpeechRecognizer): r is ScriptableRecognizer {
  return typeof (r as ScriptableRecognizer).queueScenario === 'function'
}

/** Natural-language → structured command. Swap for an LLM-backed one later. */
export interface IntentInterpreter {
  interpret(transcript: string, context: VoiceInteractionContext, members: FamilyMember[], now: Date): Promise<VoiceCommand>
}

export type ValidationResult =
  | { ok: true; action: ProposedAction }
  | { ok: false; reason: 'unclear' | 'invalid'; message: string; command: VoiceCommand }

/** Turns a command into a reviewable action, or explains why it cannot. */
export interface ActionValidator {
  validate(command: VoiceCommand, context: VoiceInteractionContext, members: FamilyMember[]): Promise<ValidationResult>
}

export type ExecutionResult = { ok: true; message: string; kind: ActionKind } | { ok: false; message: string; retryable: boolean }

/** Commits a confirmed action through the repositories. */
export interface CommandExecutor {
  execute(action: ProposedAction): Promise<ExecutionResult>
}

/** Optional spoken feedback (text-to-speech). */
export interface SpeechFeedback {
  speak(text: string): void
  cancel(): void
}

export interface ServiceContainer {
  family: FamilyRepository
  calendar: CalendarRepository
  groceries: GroceryRepository
  chores: ChoreRepository
  messages: MessageRepository
  photos: PhotoRepository
  weather: WeatherService
  capture: SpeechCapture
  recognizer: SpeechRecognizer
  interpreter: IntentInterpreter
  validator: ActionValidator
  executor: CommandExecutor
  feedback: SpeechFeedback
  /** Injectable clock so tests and demos are deterministic. */
  now(): Date
}

// Re-exported for convenience in implementations.
export type { ISODate }
