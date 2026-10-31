/**
 * Shared domain types. Everything in the app (stores, services, components)
 * talks in these shapes; nothing here knows about a backend.
 *
 * Conventions:
 *  - ids are opaque strings
 *  - instants are ISO-8601 strings with offset (`2026-10-30T07:42:00.000Z`)
 *  - calendar days are `YYYY-MM-DD` strings in the household's local time
 */

export type ID = string
export type ISODateTime = string
export type ISODate = string

// ───────────────────────── Family ─────────────────────────

/** Semantic accent keys; each theme maps them to concrete colors. */
export type AccentKey = 'blue' | 'magenta' | 'teal' | 'amber' | 'violet'

export type MemberRole = 'administrator' | 'member'
export type Presence = 'home' | 'school' | 'work' | 'away'

/** Permission hooks for the future parental-controls work (see ARCHITECTURE.md). */
export interface MemberPermissions {
  fullAccess: boolean
  kidsMode: boolean
  limitedPurchases: boolean
  /** Whether this member's data is shown on the shared front-door screen. */
  visibleOnKiosk: boolean
}

export interface FamilyMember {
  id: ID
  name: string
  role: MemberRole
  accent: AccentKey
  /** Optional; the UI falls back to an initials avatar when missing or broken. */
  photoUrl?: string
  age?: number
  presence: Presence
  permissions: MemberPermissions
  /** Optional flavor for the member dashboard. */
  profile?: { interests: string[]; motto?: string }
}

// ───────────────────────── Calendar ─────────────────────────

export type EventCategory = 'school' | 'work' | 'activity' | 'appointment' | 'home' | 'fitness' | 'other'

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly'
  interval?: number
  /** 0 = Sunday … 6 = Saturday. Only meaningful for `weekly`. */
  byWeekday?: number[]
  until?: ISODate
}

export interface CalendarEvent {
  id: ID
  title: string
  start: ISODateTime
  end: ISODateTime
  allDay?: boolean
  /** Responsible/attending members. Empty or several → shown as "Family". */
  memberIds: ID[]
  category: EventCategory
  location?: string
  notes?: string
  recurrence?: RecurrenceRule
  /** Set on expanded occurrences of a recurring event: the id of the base event. */
  seriesId?: ID
}

// ───────────────────────── Groceries ─────────────────────────

export type GroceryCategory = 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'household' | 'other'

export interface ShoppingItem {
  id: ID
  name: string
  category: GroceryCategory
  quantity?: number
  unit?: string
  purchased: boolean
  addedBy?: ID
  addedAt: ISODateTime
}

// ───────────────────────── Chores ─────────────────────────

export type ChoreIcon = 'trash' | 'pet' | 'table' | 'bath' | 'vacuum' | 'bed' | 'dishes' | 'plants' | 'generic'

export interface Chore {
  id: ID
  title: string
  detail?: string
  icon: ChoreIcon
  assigneeId: ID
  points: number
  /** Occurrence date this record currently represents. */
  dueDate: ISODate
  recurrence?: RecurrenceRule
  category?: string
}

/**
 * Immutable record of a chore being finished. Points are *derived* by summing
 * these; there is no mutable "score" counter anywhere.
 * `occurrenceKey` (`choreId@dueDate`) is unique, which blocks double-scoring.
 */
export interface ChoreCompletion {
  id: ID
  choreId: ID
  choreTitle: string
  memberId: ID
  completedAt: ISODateTime
  occurrenceKey: string
  pointsAwarded: number
}

export interface Achievement {
  id: ID
  memberId: ID
  title: string
  description: string
  icon: 'soccer' | 'book' | 'mountain' | 'users' | 'gamepad' | 'broom' | 'star'
  level: number
  earnedAt?: ISODateTime
}

// ───────────────────────── Messages ─────────────────────────

export type MessageKind = 'message' | 'announcement' | 'note'

export interface Message {
  id: ID
  kind: MessageKind
  /** Member id, or `'family'` when sent from the shared kiosk with no member selected. */
  senderId: ID | 'family'
  /** `'everyone'` or the specific recipients. */
  recipientIds: ID[] | 'everyone'
  body: string
  createdAt: ISODateTime
  /** Private messages never show their body on the shared front-door screen. */
  private?: boolean
}

export interface Reminder {
  id: ID
  text: string
  /** Who the reminder is for; undefined → whole family. */
  targetId?: ID
  createdBy: ID | 'family'
  dueAt: ISODateTime
  done: boolean
}

// ───────────────────────── Photos ─────────────────────────

export type PhotoCategory = 'sports' | 'school' | 'trips' | 'family' | 'pets' | 'other'

export interface Photo {
  id: ID
  url: string
  thumbUrl?: string
  caption?: string
  memberIds: ID[]
  category: PhotoCategory
  favorite: boolean
  takenAt: ISODateTime
}

// ───────────────────────── Weather ─────────────────────────

export type WeatherCondition = 'clear' | 'partly-cloudy' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog'

export interface WeatherSnapshot {
  location: string
  temperature: number
  condition: WeatherCondition
  conditionLabel: string
  high: number
  low: number
  unit: 'F' | 'C'
  forecast: { date: ISODate; condition: WeatherCondition; high: number; low: number }[]
}

// ───────────────────────── Voice ─────────────────────────

export type AppFeature =
  | 'home'
  | 'calendar'
  | 'chores'
  | 'groceries'
  | 'messages'
  | 'photos'
  | 'settings'

export type CalendarViewMode = 'day' | 'week' | 'month'

export type VoiceOperation = 'add' | 'edit' | 'remove' | 'complete' | 'show' | 'send'

export type VoiceOrigin = 'global-mic' | 'local-mic'

/**
 * Everything the microphone knows about "where the user is" at activation.
 * Built by `resolveVoiceContext`, most specific source wins.
 */
export interface VoiceInteractionContext {
  feature: AppFeature
  route: string
  calendarView?: CalendarViewMode
  /** ISO date or `start/end` interval the user is looking at. */
  selectedDate?: ISODate
  selectedInterval?: { start: ISODateTime; end: ISODateTime }
  memberId?: ID
  activeModal?: string
  entityId?: ID
  operation?: VoiceOperation
  /** Set when the mic dictates into a specific form field instead of issuing a command. */
  field?: DictationField
  origin: VoiceOrigin
}

export type DictationField = 'event.title' | 'chore.title' | 'photo.caption'

export type PhotoFilter = 'all' | 'favorites' | 'recent' | PhotoCategory

/** Where a "show me…" / "open…" command should take the user. */
export interface NavTarget {
  route: '/' | '/calendar' | '/tasks' | '/groceries' | '/messages' | '/photos'
  /** A member id selects them; `null` returns to the whole family; undefined leaves the filter alone. */
  memberId?: ID | null
  calendarView?: CalendarViewMode
  date?: ISODate
  photoFilter?: PhotoFilter
  /** Human summary, e.g. "Calendar · next week · Lumen". */
  label: string
}

/** A question the user answers by touching one of the options. */
export interface Clarification {
  question: string
  options: ClarifyOption[]
}

export interface ClarifyOption {
  label: string
  detail?: string
  /** Merged into the command before it is validated again. */
  patch: { intent?: VoiceIntent; entities?: VoiceCommand['entities'] }
}

export type VoiceIntent =
  | 'grocery.add'
  | 'grocery.remove'
  | 'chore.assign'
  | 'chore.complete'
  | 'chore.remove'
  | 'calendar.add'
  | 'calendar.move'
  | 'calendar.remove'
  | 'message.send'
  | 'message.remove'
  | 'reminder.add'
  | 'note.add'
  | 'navigate'
  | 'dictation'
  | 'unknown'

/** Structured result of interpreting a transcript (before validation). */
export interface VoiceCommand {
  intent: VoiceIntent
  transcript: string
  confidence: number
  entities: {
    items?: string[]
    memberId?: ID
    recipientIds?: ID[] | 'everyone'
    title?: string
    body?: string
    date?: ISODate
    startTime?: string
    points?: number
    rule?: RecurrenceRule
    /** A specific chore/event/message the user (or a clarification) pointed at. */
    entityId?: ID
    nav?: NavTarget
    field?: DictationField
  }
  /** Set when the interpreter could not decide; drives the clarification UI. */
  ambiguity?: Clarification
}

export type ActionKind =
  | 'grocery.add'
  | 'grocery.remove'
  | 'chore.complete'
  | 'calendar.add'
  | 'chore.assign'
  | 'chore.remove'
  | 'calendar.move'
  | 'calendar.remove'
  | 'message.send'
  | 'message.remove'
  | 'reminder.add'
  | 'note.add'
  | 'navigate'
  | 'dictation'

export interface ProposedActionField {
  label: string
  value: string
  memberId?: ID
}

/** Reviewable action. Nothing is committed until the user confirms it. */
export interface ProposedAction {
  id: ID
  kind: ActionKind
  title: string
  /** Short line used on the confirm button, e.g. "Add 3 Items". */
  confirmLabel: string
  fields: ProposedActionField[]
  /** List-style preview (grocery items). */
  items?: string[]
  destructive: boolean
  /** Outgoing/external actions always show recipients + content first. */
  outgoing: boolean
  /** Harmless, non-mutating actions (navigation) run without a review step. */
  autoRun?: boolean
  payload: ActionPayload
}

export type ActionPayload =
  | { kind: 'grocery.add'; items: string[]; memberId?: ID }
  | { kind: 'grocery.remove'; items: string[] }
  | { kind: 'chore.complete'; choreId: ID; memberId: ID; occurrenceDate: ISODate }
  | { kind: 'calendar.add'; title: string; start: ISODateTime; end: ISODateTime; memberIds: ID[]; category: EventCategory }
  | { kind: 'message.send'; senderId: ID | 'family'; recipientIds: ID[] | 'everyone'; body: string }
  | { kind: 'chore.assign'; title: string; detail?: string; icon: ChoreIcon; assigneeId: ID; points: number; dueDate: ISODate; recurrence?: RecurrenceRule }
  | { kind: 'chore.remove'; choreId: ID }
  | { kind: 'calendar.move'; eventId: ID; start: ISODateTime; end: ISODateTime }
  | { kind: 'calendar.remove'; eventId: ID }
  | { kind: 'message.remove'; itemId: ID; itemType: 'message' | 'reminder' }
  | { kind: 'navigate'; target: NavTarget }
  | { kind: 'dictation'; field: DictationField; text: string }
  | { kind: 'note.add'; senderId: ID | 'family'; recipientIds: ID[] | 'everyone'; body: string }
  | { kind: 'reminder.add'; text: string; targetId?: ID; createdBy: ID | 'family'; dueAt: ISODateTime }
