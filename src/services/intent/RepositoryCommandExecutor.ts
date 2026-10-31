import type { ProposedAction } from '@/models'
import { norm } from '@/utils/text'
import type { CalendarRepository, ChoreRepository, CommandExecutor, ExecutionResult, GroceryRepository, MessageRepository } from '../interfaces'

/**
 * Commits a confirmed ProposedAction through the repositories. Success is only
 * reported after the repository call resolves; any failure is surfaced.
 */
export class RepositoryCommandExecutor implements CommandExecutor {
  constructor(
    private readonly repos: {
      groceries: GroceryRepository
      calendar: CalendarRepository
      chores: ChoreRepository
      messages: MessageRepository
      now: () => Date
    },
  ) {}

  async execute(action: ProposedAction): Promise<ExecutionResult> {
    const p = action.payload
    try {
      switch (p.kind) {
        case 'grocery.add': {
          const created = await this.repos.groceries.addItems(
            p.items.map((name) => ({ name })),
            p.memberId,
          )
          const msg =
            created.length === 0
              ? 'Everything was already on the list.'
              : created.length === p.items.length
                ? `Added ${created.length} ${created.length === 1 ? 'item' : 'items'} to Groceries.`
                : `Added ${created.length} new ${created.length === 1 ? 'item' : 'items'}. The rest were already on the list.`
          return { ok: true, kind: p.kind, message: msg }
        }
        case 'grocery.remove': {
          const list = await this.repos.groceries.listItems()
          const targets = list.filter((i) => !i.purchased && p.items.some((w) => norm(w) === norm(i.name)))
          await Promise.all(targets.map((t) => this.repos.groceries.removeItem(t.id)))
          return { ok: true, kind: p.kind, message: `Removed ${targets.length} ${targets.length === 1 ? 'item' : 'items'}.` }
        }
        case 'calendar.add': {
          await this.repos.calendar.createEvent({
            title: p.title,
            start: p.start,
            end: p.end,
            memberIds: p.memberIds,
            category: p.category,
          })
          return { ok: true, kind: p.kind, message: `Added “${p.title}” to the calendar.` }
        }
        case 'message.send': {
          await this.repos.messages.sendMessage({ kind: 'message', senderId: p.senderId, recipientIds: p.recipientIds, body: p.body })
          return { ok: true, kind: p.kind, message: 'Message sent.' }
        }
        case 'note.add': {
          await this.repos.messages.sendMessage({ kind: 'note', senderId: p.senderId, recipientIds: p.recipientIds, body: p.body })
          return { ok: true, kind: p.kind, message: 'Note saved.' }
        }
        case 'reminder.add': {
          await this.repos.messages.createReminder({ text: p.text, targetId: p.targetId, createdBy: p.createdBy, dueAt: p.dueAt })
          return { ok: true, kind: p.kind, message: 'Reminder set.' }
        }
        case 'chore.complete': {
          const { completion, created } = await this.repos.chores.recordCompletion(p.choreId, p.memberId, this.repos.now(), p.occurrenceDate)
          return {
            ok: true,
            kind: p.kind,
            message: created ? `${completion.choreTitle} complete! +${completion.pointsAwarded} points.` : `${completion.choreTitle} was already complete.`,
          }
        }
      }
    } catch (err) {
      return { ok: false, retryable: true, message: err instanceof Error ? err.message : 'Something went wrong saving that.' }
    }
  }
}
