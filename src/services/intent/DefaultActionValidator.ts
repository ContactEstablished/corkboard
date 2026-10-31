import type {
  EventCategory,
  FamilyMember,
  ProposedAction,
  VoiceCommand,
  VoiceInteractionContext,
} from '@/models'
import { at, formatTime, parseISODate, startOfDay, toISODate } from '@/utils/date'
import { occurrenceOn } from '@/features/chores/occurrence'
import { norm } from '@/utils/text'
import type { ActionValidator, ChoreRepository, GroceryRepository, ValidationResult } from '../interfaces'

const MAX_ITEMS = 20
let seq = 0
const actionId = () => `act-${Date.now().toString(36)}-${(seq++).toString(36)}`

function categoryFor(title: string): EventCategory {
  const t = title.toLowerCase()
  if (/dentist|doctor|appointment|checkup/.test(t)) return 'appointment'
  if (/practice|game|lesson|class|recital/.test(t)) return 'activity'
  if (/school|homework|exam|project/.test(t)) return 'school'
  return 'other'
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Converts an interpreted command into a reviewable ProposedAction, or says
 * why it can't. Nothing here writes data: that is the executor's job, after
 * the user confirms.
 */
export class DefaultActionValidator implements ActionValidator {
  constructor(
    private readonly deps: {
      groceries: GroceryRepository
      chores: ChoreRepository
      now: () => Date
    },
  ) {}

  async validate(command: VoiceCommand, context: VoiceInteractionContext, members: FamilyMember[]): Promise<ValidationResult> {
    const e = command.entities
    const nameOf = (id?: string) => members.find((m) => m.id === id)?.name
    const fail = (reason: 'unclear' | 'invalid', message: string): ValidationResult => ({ ok: false, reason, message, command })
    const ok = (a: Omit<ProposedAction, 'id'>): ValidationResult => ({ ok: true, action: { ...a, id: actionId() } })
    const now = this.deps.now()

    switch (command.intent) {
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

      case 'calendar.add': {
        if (!e.startTime || !e.date || !e.title) return fail('unclear', 'I need a day and a time for that event.')
        const [h = 0, min = 0] = e.startTime.split(':').map(Number)
        const start = at(parseISODate(e.date), h, min)
        if (start.getTime() < now.getTime() - 5 * 60_000) {
          return fail('invalid', `That time has already passed (${formatTime(start)} ${start.toLocaleDateString('en-US', { weekday: 'long' })}).`)
        }
        const end = new Date(start.getTime() + 60 * 60_000)
        const memberIds = e.memberId ? [e.memberId] : []
        const dateLabel = describeDay(start, now)
        return ok({
          kind: 'calendar.add',
          title: 'Add Event',
          confirmLabel: 'Add Event',
          fields: [
            { label: 'Event', value: e.title },
            { label: 'Date', value: dateLabel },
            { label: 'Time', value: `${formatTime(start)} – ${formatTime(end)}` },
            { label: 'Person', value: nameOf(e.memberId) ?? 'Whole family', memberId: e.memberId },
          ],
          destructive: false,
          outgoing: false,
          payload: { kind: 'calendar.add', title: e.title, start: start.toISOString(), end: end.toISOString(), memberIds, category: categoryFor(e.title) },
        })
      }

      case 'message.send': {
        const body = e.body?.trim()
        if (!body || !e.recipientIds) return fail('unclear', 'Who should get the message, and what should it say?')
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

      case 'chore.complete': {
        if (!e.title) return fail('unclear', 'Which chore is finished?')
        const chores = await this.deps.chores.listChores()
        const done = new Set((await this.deps.chores.listCompletions()).map((c) => c.occurrenceKey))
        const wanted = norm(e.title)
        const matches = chores.filter(
          (c) =>
            occurrenceOn(c, now, done) !== null &&
            (!e.memberId || c.assigneeId === e.memberId) &&
            (norm(c.title).includes(wanted) || wanted.includes(norm(c.title))),
        )
        if (!matches.length) return fail('invalid', `I couldn't find a chore called "${e.title}"${e.memberId ? ` for ${nameOf(e.memberId)}` : ''}.`)
        const open = matches.filter((c) => !done.has(`${c.id}@${occurrenceOn(c, now, done)}`))
        if (!open.length) return fail('invalid', `${matches[0]!.title} is already marked complete.`)
        if (open.length > 1) return fail('unclear', `More than one chore matches. Which one: ${open.map((c) => `${c.title} (${nameOf(c.assigneeId)})`).join(' or ')}?`)
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

      default:
        return fail('unclear', command.ambiguity?.reason ?? "I'm not sure about that yet.")
    }
  }
}

function describeDay(d: Date, now: Date): string {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (diff === 0) return `Today, ${date}`
  if (diff === 1) return `Tomorrow, ${date}`
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })}, ${date}`
}
