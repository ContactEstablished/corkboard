import type {
  CalendarViewMode,
  ClarifyOption,
  FamilyMember,
  ISODate,
  NavTarget,
  PhotoFilter,
  RecurrenceRule,
  VoiceCommand,
  VoiceInteractionContext,
} from '@/models'
import { addDays, addMonths, startOfDay, startOfWeek, toISODate } from '@/utils/date'
import type { IntentInterpreter } from '../interfaces'

/**
 * Deterministic, regex-based stand-in for a real NLU/LLM interpreter.
 * It understands a defined set of phrasings per domain (see tests); anything
 * else becomes `unknown` so the UI asks the user to clarify instead of guessing.
 * Swap this class for an LLM-backed one behind the same `IntentInterpreter`.
 */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const EVERYONE = /^(everyone|everybody|the family|all of us|the whole family)$/i
const PRONOUN = /^(it|this|that|this event|that event|this appointment|that appointment|this one|that one)$/i

const clean = (s: string) => s.trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ')
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const titleWords = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

function findMember(phrase: string, members: FamilyMember[]): FamilyMember | undefined {
  const p = phrase.trim().toLowerCase().replace(/'s$/, '')
  return members.find((m) => m.name.toLowerCase() === p)
}

function splitItems(list: string): string[] {
  return list
    .split(/\s*,\s*|\s+and\s+|\s*&\s*/i)
    .map((s) => s.replace(/^(and|some|a|an|the)\s+/i, '').trim())
    .filter(Boolean)
    .map(capitalize)
}

/** "twenty", "twenty five", "20", "a hundred" → number. */
export function parseNumber(text: string): number | undefined {
  const t = text.trim().toLowerCase()
  if (/^\d+$/.test(t)) return Number(t)
  if (/^(a )?hundred$/.test(t)) return 100
  const [a, b] = t.split(/[\s-]+/)
  if (a && TENS[a] !== undefined) return TENS[a] + (b ? (NUMBER_WORDS[b] ?? 0) : 0)
  if (a && NUMBER_WORDS[a] !== undefined && !b) return NUMBER_WORDS[a]
  if (t === 'fifteen') return 15
  return undefined
}

/** "two" / "2" / "2:30" + optional am/pm → 24h "HH:MM". Bare 1–6 means PM, 7–11 AM. */
export function parseTime(text: string): string | undefined {
  const m = text.match(/\bat\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?=\s|$)/i)
  if (!m) return undefined
  const raw = m[1]!.toLowerCase()
  let hour = NUMBER_WORDS[raw] ?? Number(raw)
  const minute = Number(m[2] ?? 0)
  if (!Number.isFinite(hour) || hour < 0 || hour > 23 || minute > 59) return undefined
  const mer = m[3]?.toLowerCase().replace(/\./g, '')
  if (mer === 'pm' && hour < 12) hour += 12
  else if (mer === 'am' && hour === 12) hour = 0
  else if (!mer && hour >= 1 && hour <= 6) hour += 12
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** Like `parseTime`, but also accepts a bare time after "to" ("move it to 5 pm"). */
function parseLooseTime(text: string): string | undefined {
  const t = text.trim()
  return parseTime(/^(\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i.test(t) ? `at ${t}` : t)
}

/** Resolves "today", "tomorrow", "next tuesday", "friday" to a date (nearest future weekday). */
export function parseDate(text: string, now: Date): ISODate | undefined {
  const t = text.toLowerCase()
  if (/\b(today|tonight)\b/.test(t)) return toISODate(now)
  if (/\btomorrow\b/.test(t)) return toISODate(addDays(now, 1))
  const m = t.match(/\b(?:next|this|on)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (m) {
    const target = WEEKDAYS.indexOf(m[1]!)
    const delta = ((target - now.getDay() + 7) % 7) || 7
    return toISODate(addDays(startOfDay(now), delta))
  }
  return undefined
}

const DATE_RE = /\b(?:(?:next|this|on)\s+)?(?:today|tonight|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
const TIME_RE = /\bat\s+(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?(?=\s|$)/i

/** "every wednesday", "every evening", "every monday and thursday" → a recurrence rule. */
export function parseRecurrence(text: string, now: Date): RecurrenceRule | undefined {
  const t = text.toLowerCase()
  if (/\bweekdays?\b/.test(t)) return { freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] }
  if (/\bweekends?\b/.test(t)) return { freq: 'weekly', byWeekday: [0, 6] }
  const days = WEEKDAYS.map((d, i) => (new RegExp(`\\b${d}s?\\b`).test(t) ? i : -1)).filter((i) => i >= 0)
  if (days.length) return { freq: 'weekly', byWeekday: days }
  if (/\b(day|evening|morning|night|afternoon)\b/.test(t)) return { freq: 'daily' }
  if (/\bweek\b/.test(t)) return { freq: 'weekly', byWeekday: [now.getDay()] }
  if (/\bmonth\b/.test(t)) return { freq: 'monthly' }
  return undefined
}

const PHOTO_WORDS: [RegExp, PhotoFilter][] = [
  [/soccer|sport|game|goal/, 'sports'],
  [/school|science|recital|class/, 'school'],
  [/trip|vacation|camp|ski|beach|lake|mountain|travel/, 'trips'],
  [/\bfamily\b/, 'family'],
  [/\bpets?\b|\bdog\b|puppy/, 'pets'],
  [/favou?rite/, 'favorites'],
  [/recent|latest|newest/, 'recent'],
]

const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

/** "show me …" / "open …": works out where to go. Returns null if it isn't a navigation request. */
function parseNavigation(rest: string, members: FamilyMember[], now: Date): NavTarget | null {
  const t = rest.toLowerCase()
  const names = members.map((m) => m.name.toLowerCase()).join('|')
  const who = names ? t.match(new RegExp(`\\b(${names})\\b`))?.[1] : undefined
  const member = who ? findMember(who, members) : undefined
  const whoLabel = member ? ` · ${member.name}` : ''
  const base = member ? { memberId: member.id } : {}

  if (/\b(photos?|pictures?|albums?|gallery)\b/.test(t)) {
    const filter = PHOTO_WORDS.find(([re]) => re.test(t.replace(/photos?|pictures?/g, '')))?.[1] ?? 'all'
    return { route: '/photos', ...base, photoFilter: filter, label: `Photos${filter === 'all' ? '' : ` · ${filter}`}${whoLabel}` }
  }
  if (/\b(grocer(y|ies)|shopping)\b/.test(t)) return { route: '/groceries', label: 'Grocery list' }
  if (/\b(chores?|tasks?)\b/.test(t)) return { route: '/tasks', ...base, label: `Chores${whoLabel}` }
  if (/\b(messages?|notes?|reminders?)\b/.test(t)) return { route: '/messages', ...base, label: `Messages${whoLabel}` }

  const calendarish = /\b(calendar|schedule|activities|events?|appointments?|week|month|today|tomorrow|weekend|day|agenda)\b/.test(t) || WEEKDAYS.some((d) => t.includes(d))
  if (calendarish) {
    let view: CalendarViewMode = 'day'
    let date = startOfDay(now)
    let label = 'today'
    if (/\bnext week\b/.test(t)) { view = 'week'; date = addDays(startOfWeek(now), 7); label = 'next week' }
    else if (/\blast week\b/.test(t)) { view = 'week'; date = addDays(startOfWeek(now), -7); label = 'last week' }
    else if (/\b(this|the) week\b|\bweek\b/.test(t)) { view = 'week'; label = 'this week' }
    else if (/\bnext month\b/.test(t)) { view = 'month'; date = addMonths(now, 1); label = 'next month' }
    else if (/\bmonth\b/.test(t)) { view = 'month'; label = 'this month' }
    else if (/\bweekend\b/.test(t)) {
      view = 'week'
      date = addDays(startOfDay(now), (6 - now.getDay() + 7) % 7)
      label = 'this weekend'
    } else if (/\btomorrow\b/.test(t)) { date = addDays(startOfDay(now), 1); label = 'tomorrow' }
    else if (parseDate(t, now) && !/\btoday\b/.test(t)) {
      date = new Date(`${parseDate(t, now)}T00:00:00`)
      label = fmtDay(date)
    }
    return { route: '/calendar', ...base, calendarView: view, date: toISODate(date), label: `Calendar · ${label}${whoLabel}` }
  }

  if (member) return { route: '/', memberId: member.id, label: `${member.name}’s dashboard` }
  if (/\b(home|dashboard|everyone|everybody|family|everything|main)\b/.test(t)) return { route: '/', memberId: null, label: 'Family home' }
  return null
}

export class RuleBasedIntentInterpreter implements IntentInterpreter {
  async interpret(
    transcript: string,
    context: VoiceInteractionContext,
    members: FamilyMember[],
    now: Date,
  ): Promise<VoiceCommand> {
    const text = clean(transcript)
    const lower = text.toLowerCase()
    const names = members.map((m) => m.name.toLowerCase()).join('|')
    const cmd = (intent: VoiceCommand['intent'], entities: VoiceCommand['entities'], confidence = 0.9): VoiceCommand => ({
      intent,
      transcript,
      confidence,
      entities,
    })

    // Dictation: the mic was opened for one form field, so the whole utterance IS the value.
    if (context.field) return cmd('dictation', { field: context.field, body: capitalize(text) }, 1)

    // Show me … / Open …
    let m = lower.match(/^(?:show|open|pull up|go to|take me to|switch to|bring up)\s+(?:me\s+)?(?:the\s+|our\s+)?(.+)$/)
    if (m) {
      const nav = parseNavigation(m[1]!, members, now)
      if (nav) return cmd('navigate', { nav })
    }

    // Send <who> a message that <body>
    m = lower.match(/^(?:send|text)\s+(.+?)\s+a\s+(?:message|text|note)\s+(?:that|saying|to say|telling (?:them|everyone))?\s*(.+)$/)
    if (m) {
      const who = m[1]!
      const body = capitalize(text.slice(text.toLowerCase().lastIndexOf(m[2]!)))
      if (EVERYONE.test(who)) return cmd('message.send', { recipientIds: 'everyone', body })
      const member = findMember(who, members)
      if (member) return cmd('message.send', { recipientIds: [member.id], body })
    }

    // Add a note that <body>
    m = lower.match(/^(?:add|make|save|write)\s+(?:a\s+)?note\s*(?:that|saying|to say|:)?\s*(.+)$/)
    if (m) return cmd('note.add', { body: capitalize(text.slice(lower.lastIndexOf(m[1]!))) })

    // Remind <who> to <task> [today|tomorrow]
    m = lower.match(new RegExp(`^remind\\s+(${names}|everyone|everybody|me)\\s+to\\s+(.+?)(?:\\s+(tomorrow|today|tonight))?$`))
    if (m) {
      const who = m[1]!
      const memberId = findMember(who, members)?.id ?? (who === 'me' ? context.memberId : undefined)
      return cmd('reminder.add', { memberId, body: capitalize(m[2]!), date: parseDate(m[3] ?? '', now) })
    }

    // Assign <name> to <chore> [every …] [for N points]   |   Give <name> the <chore> chore …
    m = lower.match(new RegExp(`^(?:assign|give)\\s+(${names})\\s+(?:to\\s+)?(?:the\\s+)?(.+?)(?:\\s+chore)?(?:\\s+every\\s+(.+?))?(?:\\s+for\\s+(.+?)\\s+points?)?$`))
    if (m) {
      return cmd('chore.assign', {
        memberId: findMember(m[1]!, members)?.id,
        title: capitalize(m[2]!),
        rule: m[3] ? parseRecurrence(m[3], now) : undefined,
        points: m[4] ? parseNumber(m[4]) : undefined,
      })
    }

    // Mark <name>'s <chore> as complete  |  <name> finished <chore>
    m = lower.match(new RegExp(`^(?:mark|set)\\s+(?:(${names})'s\\s+)?(.+?)\\s+(?:as\\s+)?(?:complete|completed|done|finished)$`))
    if (m) {
      const memberId = findMember(m[1] ?? '', members)?.id ?? context.memberId
      return cmd('chore.complete', { memberId, title: m[2]! })
    }
    m = lower.match(new RegExp(`^(${names})\\s+(?:finished|completed|did)\\s+(?:the\\s+|his\\s+|her\\s+)?(.+)$`))
    if (m) return cmd('chore.complete', { memberId: findMember(m[1]!, members)?.id, title: m[2]! })

    // Remove <items> from the (grocery) list
    m = lower.match(/^(?:remove|delete|take)\s+(.+?)\s+(?:from|off)\s+(?:the|our|my)?\s*(?:grocery|groceries|shopping)?\s*list$/)
    if (m) return cmd('grocery.remove', { items: splitItems(m[1]!) })

    // Delete the <chore> chore
    m = lower.match(new RegExp(`^(?:remove|delete|cancel)\\s+(?:(${names})'s\\s+)?(?:the\\s+)?(.+?)\\s+chore$`))
    if (m) return cmd('chore.remove', { memberId: findMember(m[1] ?? '', members)?.id, title: m[2]! })

    // Delete the message about <x>
    m = lower.match(/^(?:remove|delete)\s+(?:the\s+)?(?:message|note|reminder)s?\s+(?:about|saying|that says|on)\s+(.+)$/)
    if (m) return cmd('message.remove', { body: m[1]! })

    // Move/reschedule <event> to <when>
    m = lower.match(/^(?:move|reschedule|change)\s+(?:the\s+)?(.+?)\s+to\s+(.+)$/)
    if (m) {
      const subject = m[1]!
      const pronoun = PRONOUN.test(subject)
      return cmd('calendar.move', {
        title: pronoun ? undefined : subject,
        entityId: pronoun ? context.entityId : undefined,
        date: parseDate(m[2]!, now),
        startTime: parseLooseTime(m[2]!),
      })
    }

    // Cancel/delete <event>
    m = lower.match(/^(?:cancel|delete|remove)\s+(?:the\s+)?(.+?)(?:\s+(?:event|appointment))?(?:\s+from\s+the\s+calendar)?$/)
    if (m) {
      const subject = m[1]!
      const pronoun = PRONOUN.test(subject)
      return cmd('calendar.remove', { title: pronoun ? undefined : subject, entityId: pronoun ? context.entityId : undefined })
    }

    // Add <items> to the grocery/shopping list — or bare "add <items>" while inside Groceries
    m = lower.match(/^(?:please\s+)?add\s+(.+?)\s+(?:to|on|onto)\s+(?:the|our|my)?\s*(?:grocery|groceries|shopping)\s*(?:list)?$/)
    if (m) return cmd('grocery.add', { items: splitItems(m[1]!) })
    if (context.feature === 'groceries') {
      m = lower.match(/^(?:please\s+)?add\s+(.+)$/)
      if (m) return cmd('grocery.add', { items: splitItems(m[1]!) }, 0.8)
    }

    // Add/schedule <title> [for <name>] [date] [at <time>]
    m = lower.match(/^(?:add|schedule|create|put)\s+(?:an?\s+|the\s+)?(.+)$/)
    if (m) {
      let rest = m[1]!
      const startTime = parseTime(rest)
      const date = parseDate(rest, now)
      const forMatch = rest.match(new RegExp(`\\bfor\\s+(${names}|everyone|the family)\\b`))
      const memberId = forMatch ? findMember(forMatch[1]!, members)?.id : context.memberId
      rest = rest
        .replace(TIME_RE, '')
        .replace(DATE_RE, '')
        .replace(/\bfor\s+(?:everyone|the family)\b/, '')
        .replace(new RegExp(`\\bfor\\s+(?:${names})\\b`), '')
        .replace(/\b(?:to|on|in)\s+the\s+calendar\b/, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!rest) rest = 'event'
      const title = titleWords(rest)
      const day = date ?? (context.feature === 'calendar' && context.selectedDate ? context.selectedDate : toISODate(now))

      // On the calendar screen the intent is obvious; the missing time is asked as a follow-up.
      if (startTime || context.feature === 'calendar') return cmd('calendar.add', { title, date: day, startTime, memberId })

      // Elsewhere "Add practice tomorrow" could be an event, a chore, a reminder or a message.
      const options: ClarifyOption[] = [
        { label: 'Add a calendar event', detail: 'e.g. soccer practice, music practice', patch: { intent: 'calendar.add' } },
        { label: 'Assign a chore', detail: 'e.g. practice the piano', patch: { intent: 'chore.assign', entities: { title } } },
        { label: 'Set a reminder', detail: 'e.g. remind someone to practice', patch: { intent: 'reminder.add', entities: { body: capitalize(rest) } } },
        { label: 'Send a message', detail: 'e.g. tell someone about practice', patch: { intent: 'message.send', entities: { body: capitalize(rest) } } },
      ]
      return {
        intent: 'unknown',
        transcript,
        confidence: 0.4,
        entities: { title, date: day, memberId },
        ambiguity: { question: 'This could mean a few things. Which did you mean?', options },
      }
    }

    return { intent: 'unknown', transcript, confidence: 0.2, entities: {} }
  }
}
