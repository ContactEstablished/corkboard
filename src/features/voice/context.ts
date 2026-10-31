import type {
  AppFeature,
  CalendarViewMode,
  ID,
  ISODate,
  VoiceInteractionContext,
  VoiceOrigin,
} from '@/models'

/** What the shell knows regardless of which control was pressed. */
export interface ContextBase {
  route: string
  feature: AppFeature
  calendarView?: CalendarViewMode
  selectedDate?: ISODate
  memberId?: ID | null
}

/** What a specific control or modal adds. Defined keys win over the base. */
export type ContextOverride = Partial<Omit<VoiceInteractionContext, 'origin' | 'route'>>

/**
 * "Use the most specific active context." Start from the shell-level context,
 * then let the local control (e.g. the Grocery modal's mic) override it. An
 * explicit `undefined` in the override never erases a base value.
 */
export function resolveVoiceContext(base: ContextBase, origin: VoiceOrigin, override: ContextOverride = {}): VoiceInteractionContext {
  const ctx: VoiceInteractionContext = {
    feature: base.feature,
    route: base.route,
    calendarView: base.calendarView,
    selectedDate: base.selectedDate,
    memberId: base.memberId ?? undefined,
    origin,
  }
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) (ctx as unknown as Record<string, unknown>)[key] = value
  }
  return ctx
}

const FEATURE_TITLES: Record<AppFeature, string> = {
  home: 'Family Hub',
  calendar: 'Calendar',
  chores: 'Chores',
  groceries: 'Groceries',
  messages: 'Messages',
  photos: 'Photos',
  settings: 'Settings',
}

export function featureLabel(feature: AppFeature): string {
  return FEATURE_TITLES[feature]
}

/** Contextual modal title, e.g. "Add to Groceries". */
const FIELD_TITLES = { 'event.title': 'Name this event', 'chore.title': 'Name this chore', 'photo.caption': 'Add a caption' } as const

export function voiceTitle(ctx: VoiceInteractionContext): string {
  if (ctx.field) return FIELD_TITLES[ctx.field]
  switch (ctx.feature) {
    case 'groceries':
      return 'Add to Groceries'
    case 'calendar':
      return 'Add Calendar Event'
    case 'chores':
      return ctx.operation === 'complete' ? 'Complete a Chore' : 'Chores'
    case 'messages':
      return 'New Family Message'
    case 'photos':
      return 'Photos'
    default:
      return 'How can I help?'
  }
}

/** Hint line under the title: what is understood by default here. */
export function voiceHint(ctx: VoiceInteractionContext, memberName?: string): string {
  const who = memberName ? ` for ${memberName}` : ''
  if (ctx.field) return 'Just say it, for example “Soccer tournament”'
  if (ctx.entityId && ctx.feature === 'calendar') return 'Try “Move it to 5 PM” or “Cancel it”'
  switch (ctx.feature) {
    case 'groceries':
      return 'Try “Add milk, eggs, and bananas”'
    case 'calendar':
      return `Try “Add soccer practice tomorrow at 4${who}” or “Show me next week”`
    case 'chores':
      return memberName ? `Chores${who} · try “Mark the trash as complete”` : 'Try “Assign Liam to take out the trash every Wednesday for twenty points”'
    case 'messages':
      return 'Try “Send everyone a message that dinner is at six”'
    case 'photos':
      return 'Try “Open Liam’s soccer photos”'
    default:
      return 'Say what you need: groceries, events, chores, messages, or “Show me next week”'
  }
}
