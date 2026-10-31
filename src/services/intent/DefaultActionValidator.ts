import { describeRecurrence } from '@/features/calendar/recurrence'
import { occurrenceOn } from '@/features/chores/occurrence'
import type {
  CalendarEvent,
  Chore,
  ChoreIcon,
  ClarifyOption,
  EventCategory,
  FamilyMember,
  ProposedAction,
  VoiceCommand,
  VoiceInteractionContext,
} from '@/models'
import { addDays, at, formatTime, parseISODate, startOfDay, toISODate } from '@/utils/date'
import { norm } from '@/utils/text'
import type { ActionValidator, CalendarRepository, ChoreRepository, GroceryRepository, MessageRepository, ValidationResult } from '../interfaces'

const MAX_ITEMS = 20
const TIME_CHOICES = ['08:00', '09:00', '12:00', '15:00', '16:00', '17:00', '18:00', '19:00']
let seq = 0
const actionId = () => `act-${Date.now().toString(36)}-${(seq++).toString(36)}`

function categoryFor(title: string): EventCategory {
  const t = title.toLowerCase()
  if (/dentist|doctor|appointment|checkup/.test(t)) return 'appointment'
  if (/practice|game|lesson|class|recital/.test(t)) return 'activity'
  if (/school|homework|exam|project/.test(t)) return 'school'
  return 'other'
}

function iconFor(title: string): ChoreIcon {
  const t = title.toLowerCase()
  if (/trash|garbage|bins?/.test(t)) return 'trash'
  if (/dog|cat|pet|fish|feed/.test(t)) return 'pet'
  if (/table|dinner/.test(t)) return 'table'
  if (/dish/.test(t)) return 'dishes'
  if (/bath|toilet|shower/.test(t)) return 'bath'
  if (/vacuum|sweep|mop/.test(t)) return 'vacuum'
  if (/room|bed|toys/.test(t)) return 'bed'
  if (/plant|garden|water/.test(t)) return 'plants'
  return 'generic'
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const timeLabel = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return formatTime(at(new Date(2000, 0, 1), h, m))
}

function describeDay(d: Date, now: Date): string {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (diff === 0) return `Today, ${date}`
  if (diff === 1) return `Tomorrow, ${date}`
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })}, ${date}`
}

const stamp = (e: CalendarEvent) => `${new Date(e.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${formatTime(new Date(e.start))}`

type Found<T> = { kind: 'one'; item: T } | { kind: 'many'; items: T[] } | { kind: 'none' }

/**
 * Converts an interpreted command into a reviewable ProposedAction, a
 * clarifying question, or a reason it can't. Nothing here writes data: that
 * is the executor's job, after the user confirms.
 */
export class DefaultActionValidator implements ActionValidator {
  constructor(
    private readonly deps: {
      groceries: GroceryRepository
      chores: ChoreRepository
      calendar: CalendarRepository
      messages: MessageRepository
      now: () => Date
    },
  ) {}

  async validate(command: VoiceCommand, context: VoiceInteractionContext, members: FamilyMember[]): Promise<ValidationResult> {
    const e = command.entities
    const nameOf = (id?: string) => members.find((m) => m.id === id)?.name
    const fail = (reason: 'unclear' | 'invalid', message: string): ValidationResult => ({ ok: false, reason, message, command })
    const ask = (question: string, options: ClarifyOption[]): ValidationResult => ({
      ok: false,
      reason: 'clarify',
      message: question,
      command,
      clarification: { question, options },
    })
    const ok = (a: Omit<ProposedAction, 'id'>): ValidationResult => ({ ok: true, action: { ...a, id: actionId() } })
    const now = this.deps.now()

    switch (command.intent) {
      // ───────────── groceries ─────────────
      case 'grocery.add': {
        const items = [...new Set(e.items ?? [])]
        if (!items.length) return fail('unclear', "I didn't catch which items to add.")
        if (items.length > MAX_ITEMS) return fail('invalid', `That's a lot! Try ${MAX_ITEMS} items or fewer at a time.`)
        return ok({
          kind: 'grocery.add',
          title: 'Ready to add',
          confirmLabel: `Add ${plural(items.length, 'Item')}`,
          fields: [],
          items,
          destructive: false,
          outgoing: false,
          payload: { kind: 'grocery.add', items, memberId: context.memberId },
        })
      }

      case 'grocery.remove': {
        const wanted = e.items ?? []
        if (!wanted.length) return fail('unclear', "I didn't catch which items to remove.")
        const list = await this.deps.groceries.listItems()
        const found = wanted.filter((w) => list.some((i) => !i.purchased && norm(i.name) === norm(w)))
        if (!found.length) return fail('invalid', `I couldn't find ${wanted.join(', ')} on the list.`)
        return ok({
          kind: 'grocery.remove',
          title: 'Remove from list?',
          confirmLabel: `Remove ${plural(found.length, 'Item')}`,
          fields: [],
          items: found,
          destructive: true,
          outgoing: false,
          payload: { kind: 'grocery.remove', items: found },
        })
      }

      // ───────────── calendar ─────────────
      case 'calendar.add': {
        if (!e.title) return fail('unclear', 'What should the event be called?')
        if (!e.startTime) {
          return ask(
            `What time is “${e.title}”?`,
            TIME_CHOICES.map((t) => ({ label: timeLabel(t), patch: { entities: { startTime: t } } })),
          )
        }
        const [h = 0, min = 0] = e.startTime.split(':').map(Number)
        const start = at(parseISODate(e.date ?? toISODate(now)), h, min)
        if (start.getTime() < now.getTime() - 5 * 60_000) {
          return fail('invalid', `That time has already passed (${formatTime(start)} ${start.toLocaleDateString('en-US', { weekday: 'long' })}).`)
        }
        const end = new Date(start.getTime() + 60 * 60_000)
        return ok({
          kind: 'calendar.add',
          title: 'Add Event',
          confirmLabel: 'Add Event',
          fields: [
            { label: 'Event', value: e.title },
            { label: 'Date', value: describeDay(start, now) },
            { label: 'Time', value: `${formatTime(start)} – ${formatTime(end)}` },
            { label: 'Person', value: nameOf(e.memberId) ?? 'Whole family', memberId: e.memberId },
          ],
          destructive: false,
          outgoing: false,
          payload: { kind: 'calendar.add', title: e.title, start: start.toISOString(), end: end.toISOString(), memberIds: e.memberId ? [e.memberId] : [], category: categoryFor(e.title) },
        })
      }

      case 'calendar.move':
      case 'calendar.remove': {
        const found = await this.findEvent(e.title, e.entityId ?? (e.title ? undefined : context.entityId), now)
        if (found.kind === 'none') return fail('invalid', e.title ? `I couldn't find “${e.title}” on the calendar.` : 'Which event do you mean? Open it, or say its name.')
        if (found.kind === 'many') {
          return ask(
            `Which “${e.title}” do you mean?`,
            found.items.map((ev) => ({ label: ev.title, detail: stamp(ev), patch: { entities: { entityId: ev.id } } })),
          )
        }
        const ev = found.item
        const series = !!ev.seriesId
        const people = ev.memberIds.map(nameOf).filter(Boolean).join(', ') || 'Whole family'

        if (command.intent === 'calendar.remove') {
          return ok({
            kind: 'calendar.remove',
            title: series ? 'Cancel every repeat?' : 'Cancel this event?',
            confirmLabel: series ? 'Cancel All Repeats' : 'Cancel Event',
            fields: [
              { label: 'Event', value: ev.title },
              { label: 'When', value: stamp(ev) },
              { label: 'Who', value: people },
              ...(series ? [{ label: 'Repeats', value: describeRecurrence(ev.recurrence) }] : []),
            ],
            destructive: true,
            outgoing: false,
            payload: { kind: 'calendar.remove', eventId: ev.id },
          })
        }

        if (!e.startTime && !e.date) {
          return ask(
            `What time should “${ev.title}” move to?`,
            TIME_CHOICES.map((t) => ({ label: timeLabel(t), patch: { entities: { startTime: t } } })),
          )
        }
        const old = new Date(ev.start)
        const duration = new Date(ev.end).getTime() - old.getTime()
        const [h = old.getHours(), min = old.getMinutes()] = e.startTime ? e.startTime.split(':').map(Number) : []
        const day = !series && e.date ? parseISODate(e.date) : startOfDay(old)
        const start = at(day, e.startTime ? h : old.getHours(), e.startTime ? min : old.getMinutes())
        if (!series && start.getTime() < now.getTime() - 5 * 60_000) return fail('invalid', 'That time has already passed.')
        const end = new Date(start.getTime() + duration)
        return ok({
          kind: 'calendar.move',
          title: 'Move Event',
          confirmLabel: 'Move Event',
          fields: [
            { label: 'Event', value: ev.title },
            { label: 'Was', value: stamp(ev) },
            { label: 'Now', value: series ? `${formatTime(start)} – ${formatTime(end)}, every repeat` : `${describeDay(start, now)}, ${formatTime(start)} – ${formatTime(end)}` },
            ...(series && e.date ? [{ label: 'Note', value: 'This repeats, so only the time changes. Dates stay the same.' }] : []),
          ],
          destructive: false,
          outgoing: false,
          payload: { kind: 'calendar.move', eventId: ev.id, start: start.toISOString(), end: end.toISOString() },
        })
      }

      // ───────────── messages ─────────────
      case 'message.send': {
        const body = e.body?.trim()
        if (!body) return fail('unclear', 'What should the message say?')
        if (!e.recipientIds) {
          return ask('Who should get this message?', [
            { label: 'Everyone', patch: { entities: { recipientIds: 'everyone' } } },
            ...members.map((m) => ({ label: m.name, patch: { entities: { recipientIds: [m.id] } } })),
          ])
        }
        const senderId = context.memberId ?? 'family'
        const toLabel = e.recipientIds === 'everyone' ? 'Everyone' : e.recipientIds.map((id) => nameOf(id) ?? id).join(', ')
        return ok({
          kind: 'message.send',
          title: 'Send Message',
          confirmLabel: 'Send Message',
          fields: [
            { label: 'From', value: nameOf(senderId) ?? 'Family Hub', memberId: senderId === 'family' ? undefined : senderId },
            { label: 'To', value: toLabel, memberId: e.recipientIds !== 'everyone' && e.recipientIds.length === 1 ? e.recipientIds[0] : undefined },
            { label: 'Message', value: body },
          ],
          destructive: false,
          outgoing: true,
          payload: { kind: 'message.send', senderId, recipientIds: e.recipientIds, body },
        })
      }

      case 'note.add': {
        const body = e.body?.trim()
        if (!body) return fail('unclear', 'What should the note say?')
        const senderId = context.memberId ?? 'family'
        const personal = !!context.memberId
        return ok({
          kind: 'note.add',
          title: 'Save Note',
          confirmLabel: 'Save Note',
          fields: [
            { label: 'Shared with', value: personal ? `Only ${nameOf(senderId)}` : 'Everyone', memberId: personal ? senderId : undefined },
            { label: 'Note', value: body },
          ],
          destructive: false,
          outgoing: !personal,
          payload: { kind: 'note.add', senderId, recipientIds: personal ? [senderId] : 'everyone', body },
        })
      }

      case 'reminder.add': {
        const text = e.body?.trim()
        if (!text) return fail('unclear', 'What should I remind them about?')
        const target = e.memberId
        const due = e.date && e.date !== toISODate(now) ? at(parseISODate(e.date), 8, 0) : new Date(Math.ceil((now.getTime() + 3_600_000) / 900_000) * 900_000)
        return ok({
          kind: 'reminder.add',
          title: 'Set Reminder',
          confirmLabel: 'Set Reminder',
          fields: [
            { label: 'For', value: nameOf(target) ?? 'Everyone', memberId: target },
            { label: 'Reminder', value: text },
            { label: 'When', value: `${describeDay(due, now)}, ${formatTime(due)}` },
          ],
          destructive: false,
          outgoing: true, // reminders are shown to someone else on the shared screen
          payload: { kind: 'reminder.add', text, targetId: target, createdBy: context.memberId ?? 'family', dueAt: due.toISOString() },
        })
      }

      case 'message.remove': {
        const needle = norm(e.body ?? '')
        if (!needle) return fail('unclear', 'Which message should I delete?')
        const [messages, reminders] = await Promise.all([this.deps.messages.listMessages(), this.deps.messages.listReminders()])
        let hits = [
          ...messages.filter((m) => !m.private && norm(m.body).includes(needle)).map((m) => ({ id: m.id, type: 'message' as const, text: m.body, by: m.senderId as string })),
          ...reminders.filter((r) => norm(r.text).includes(needle)).map((r) => ({ id: r.id, type: 'reminder' as const, text: r.text, by: r.createdBy as string })),
        ]
        if (!hits.length) return fail('invalid', `I couldn't find a message about “${e.body}”.`)
        if (e.entityId) hits = hits.filter((h) => h.id === e.entityId)
        if (hits.length > 1) {
          return ask(
            'Which one should I delete?',
            hits.map((h) => ({ label: h.text, detail: h.type === 'reminder' ? 'Reminder' : `From ${nameOf(h.by) ?? 'Family'}`, patch: { entities: { entityId: h.id } } })),
          )
        }
        const hit = hits[0]
        if (!hit) return fail('invalid', `I couldn't find a message about “${e.body}”.`)
        return ok({
          kind: 'message.remove',
          title: `Delete this ${hit.type}?`,
          confirmLabel: `Delete ${hit.type === 'reminder' ? 'Reminder' : 'Message'}`,
          fields: [
            { label: hit.type === 'reminder' ? 'Reminder' : 'Message', value: hit.text },
            { label: 'From', value: nameOf(hit.by) ?? 'Family Hub' },
          ],
          destructive: true,
          outgoing: false,
          payload: { kind: 'message.remove', itemId: hit.id, itemType: hit.type },
        })
      }

      // ───────────── chores ─────────────
      case 'chore.complete': {
        if (!e.title) return fail('unclear', 'Which chore is finished?')
        const chores = await this.deps.chores.listChores()
        const done = new Set((await this.deps.chores.listCompletions()).map((c) => c.occurrenceKey))
        const wanted = norm(e.title)
        const matches = chores.filter(
          (c) =>
            occurrenceOn(c, now, done) !== null &&
            (!e.entityId || c.id === e.entityId) &&
            (!e.memberId || c.assigneeId === e.memberId) &&
            (norm(c.title).includes(wanted) || wanted.includes(norm(c.title))),
        )
        if (!matches.length) return fail('invalid', `I couldn't find a chore called "${e.title}"${e.memberId ? ` for ${nameOf(e.memberId)}` : ''}.`)
        const open = matches.filter((c) => !done.has(`${c.id}@${occurrenceOn(c, now, done)}`))
        if (!open.length) return fail('invalid', `${matches[0]!.title} is already marked complete.`)
        if (open.length > 1) {
          return ask(
            'More than one chore matches. Which one?',
            open.map((c) => ({ label: c.title, detail: `${nameOf(c.assigneeId)} · +${c.points} pts`, patch: { entities: { entityId: c.id } } })),
          )
        }
        const chore = open[0]!
        return ok({
          kind: 'chore.complete',
          title: 'Mark Complete',
          confirmLabel: `Complete +${chore.points} pts`,
          fields: [
            { label: 'Chore', value: chore.title },
            { label: 'Who', value: nameOf(chore.assigneeId) ?? '', memberId: chore.assigneeId },
            { label: 'Points', value: `+${chore.points}` },
          ],
          destructive: false,
          outgoing: false,
          payload: { kind: 'chore.complete', choreId: chore.id, memberId: chore.assigneeId, occurrenceDate: occurrenceOn(chore, now, done)! },
        })
      }

      case 'chore.assign': {
        const title = e.title?.trim()
        if (!title) return fail('unclear', 'Which chore should I assign?')
        const assigneeId = e.memberId ?? context.memberId
        if (!assigneeId) return ask(`Who should do “${title}”?`, members.map((m) => ({ label: m.name, patch: { entities: { memberId: m.id } } })))
        const points = e.points ?? 10
        if (points < 1 || points > 100) return fail('invalid', 'Chores are worth between 1 and 100 points.')
        const existing = (await this.deps.chores.listChores()).find((c) => c.assigneeId === assigneeId && norm(c.title) === norm(title))
        if (existing) return fail('invalid', `${nameOf(assigneeId)} already has “${existing.title}”. Open Chores to change it.`)
        return ok({
          kind: 'chore.assign',
          title: 'Assign Chore',
          confirmLabel: 'Assign Chore',
          fields: [
            { label: 'Chore', value: title },
            { label: 'Assignee', value: nameOf(assigneeId) ?? '', memberId: assigneeId },
            { label: 'Repeat', value: describeRecurrence(e.rule) },
            { label: 'Points', value: `${points} points` },
          ],
          destructive: false,
          outgoing: false,
          payload: { kind: 'chore.assign', title, icon: iconFor(title), assigneeId, points, dueDate: toISODate(now), recurrence: e.rule },
        })
      }

      case 'chore.remove': {
        const chores = await this.deps.chores.listChores()
        const wanted = norm(e.title ?? '')
        const matches = chores.filter(
          (c) => (!e.entityId || c.id === e.entityId) && (!e.memberId || c.assigneeId === e.memberId) && !!wanted && (norm(c.title).includes(wanted) || wanted.includes(norm(c.title))),
        )
        if (!matches.length) return fail('invalid', `I couldn't find a chore called "${e.title}".`)
        if (matches.length > 1) {
          return ask(
            'Which chore should I delete?',
            matches.map((c: Chore) => ({ label: c.title, detail: nameOf(c.assigneeId), patch: { entities: { entityId: c.id } } })),
          )
        }
        const c = matches[0]!
        return ok({
          kind: 'chore.remove',
          title: 'Delete this chore?',
          confirmLabel: 'Delete Chore',
          fields: [
            { label: 'Chore', value: c.title },
            { label: 'Assignee', value: nameOf(c.assigneeId) ?? '', memberId: c.assigneeId },
            { label: 'Repeat', value: describeRecurrence(c.recurrence) },
          ],
          destructive: true,
          outgoing: false,
          payload: { kind: 'chore.remove', choreId: c.id },
        })
      }

      // ───────────── navigation & dictation ─────────────
      case 'navigate': {
        if (!e.nav) return fail('unclear', 'Where would you like to go?')
        return ok({
          kind: 'navigate',
          title: 'Opening',
          confirmLabel: 'Open',
          fields: [{ label: 'Opening', value: e.nav.label }],
          destructive: false,
          outgoing: false,
          autoRun: true,
          payload: { kind: 'navigate', target: e.nav },
        })
      }

      case 'dictation': {
        const text = e.body?.trim()
        if (!text || !e.field) return fail('unclear', "I didn't catch that.")
        const what = { 'event.title': 'title', 'chore.title': 'name', 'photo.caption': 'caption' }[e.field]
        return ok({
          kind: 'dictation',
          title: `Use this ${what}?`,
          confirmLabel: `Use This ${what.charAt(0).toUpperCase()}${what.slice(1)}`,
          fields: [{ label: what.charAt(0).toUpperCase() + what.slice(1), value: text }],
          destructive: false,
          outgoing: false,
          payload: { kind: 'dictation', field: e.field, text },
        })
      }

      default:
        if (command.ambiguity) return ask(command.ambiguity.question, command.ambiguity.options)
        return fail('unclear', "I'm not sure about that yet. Try saying it a different way.")
    }
  }

  /** Finds upcoming events by title, or by id. Series collapse to their next occurrence. */
  private async findEvent(title: string | undefined, entityId: string | undefined, now: Date): Promise<Found<CalendarEvent>> {
    const events = await this.deps.calendar.listEvents(addDays(startOfDay(now), -1), addDays(now, 60))
    const upcoming = events.filter((ev) => new Date(ev.end) >= now || (!!entityId && ev.id === entityId))

    if (entityId) {
      const base = entityId.split('#')[0]!
      const mine = upcoming.filter((ev) => (ev.seriesId ?? ev.id) === base)
      const exact = mine.find((ev) => ev.id === entityId) ?? mine[0]
      return exact ? { kind: 'one', item: exact } : { kind: 'none' }
    }
    const needle = norm(title ?? '')
    if (!needle) return { kind: 'none' }
    const hits = upcoming.filter((ev) => norm(ev.title).includes(needle) || needle.includes(norm(ev.title)))
    const bySeries = new Map<string, CalendarEvent>()
    for (const ev of hits) if (!bySeries.has(ev.seriesId ?? ev.id)) bySeries.set(ev.seriesId ?? ev.id, ev)
    const items = [...bySeries.values()]
    return items.length === 0 ? { kind: 'none' } : items.length === 1 ? { kind: 'one', item: items[0]! } : { kind: 'many', items: items.slice(0, 5) }
  }
}
