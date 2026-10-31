import type { FamilyMember, ISODate, VoiceCommand, VoiceInteractionContext } from '@/models'
import { addDays, startOfDay, toISODate } from '@/utils/date'
import type { IntentInterpreter } from '../interfaces'

/**
 * Deterministic, regex-based stand-in for a real NLU/LLM interpreter.
 * It understands a handful of phrasings per domain (see tests); anything else
 * becomes `unknown` so the UI asks the user to retry instead of guessing.
 */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
}
const EVERYONE = /^(everyone|everybody|the family|all of us|the whole family)$/i

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

    // Send <who> a message that <body>
    let m = lower.match(/^(?:send|text)\s+(.+?)\s+a\s+(?:message|text|note)\s+(?:that|saying|to say|telling (?:them|everyone))?\s*(.+)$/)
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

      if (!startTime) {
        return {
          intent: 'unknown',
          transcript,
          confidence: 0.4,
          entities: { title: titleWords(rest), date, memberId },
          ambiguity: {
            reason: 'This could mean a few things. Which did you mean?',
            options: [
              { label: 'Add a calendar event', intent: 'calendar.add' },
              { label: 'Assign a chore', intent: 'chore.assign' },
              { label: 'Set a reminder', intent: 'reminder.add' },
              { label: 'Send a message', intent: 'message.send' },
            ],
          },
        }
      }
      return cmd('calendar.add', { title: titleWords(rest), date: date ?? toISODate(now), startTime, memberId })
    }

    return {
      intent: 'unknown',
      transcript,
      confidence: 0.2,
      entities: {},
    }
  }
}
