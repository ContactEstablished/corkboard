import type { Chore, ISODate } from '@/models'
import { nextOccurrence, occursOn } from '@/features/calendar/recurrence'
import { parseISODate, startOfDay, toISODate } from '@/utils/date'

/**
 * A chore's `dueDate` is the first day it applies; `recurrence` (if any)
 * repeats it. A one-off chore that is still open after its date keeps
 * showing up as due ("overdue") until it is completed.
 */
export function occurrenceOn(chore: Chore, day: Date, completedKeys?: Set<string>): ISODate | null {
  const start = parseISODate(chore.dueDate)
  const today = startOfDay(day)
  if (chore.recurrence) return occursOn(chore.recurrence, start, today) ? toISODate(today) : null
  if (toISODate(today) === chore.dueDate) return chore.dueDate
  if (today > start && completedKeys && !completedKeys.has(`${chore.id}@${chore.dueDate}`)) return chore.dueDate // overdue
  return null
}

export function nextDueDate(chore: Chore, from: Date): ISODate | null {
  return nextOccurrence(chore.recurrence, parseISODate(chore.dueDate), from)
}

/** "Today", "Tomorrow", or "Wed". */
export function dueLabel(iso: ISODate | null, today: Date): string {
  if (!iso) return 'Done'
  const diff = Math.round((parseISODate(iso).getTime() - startOfDay(today).getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0) return 'Overdue'
  return parseISODate(iso).toLocaleDateString('en-US', { weekday: 'short' })
}
