import { describe, expect, it } from 'vitest'
import { seedMembers } from '@/data/seed'
import type { VoiceInteractionContext } from '@/models'
import { RuleBasedIntentInterpreter, parseDate, parseTime } from '@/services/intent/RuleBasedIntentInterpreter'
import { NOW } from './helpers'

const members = seedMembers()
const interp = new RuleBasedIntentInterpreter()
const ctx = (over: Partial<VoiceInteractionContext> = {}): VoiceInteractionContext => ({ feature: 'home', route: '/', origin: 'global-mic', ...over })
const run = (t: string, c = ctx()) => interp.interpret(t, c, members, NOW)

describe('time and date parsing', () => {
  it('reads spoken times, assuming afternoon for bare 1–6', () => {
    expect(parseTime('at two')).toBe('14:00')
    expect(parseTime('at 4:30 pm')).toBe('16:30')
    expect(parseTime('at 9 am')).toBe('09:00')
    expect(parseTime('at 12 am')).toBe('00:00')
    expect(parseTime('no time here')).toBeUndefined()
  })

  it('resolves relative days against "now" (Thu 29 Oct 2026)', () => {
    expect(parseDate('tomorrow', NOW)).toBe('2026-10-30')
    expect(parseDate('today', NOW)).toBe('2026-10-29')
    expect(parseDate('next tuesday', NOW)).toBe('2026-11-03')
    expect(parseDate('on thursday', NOW)).toBe('2026-11-05') // a bare weekday is never "today"
  })
})

describe('intent interpretation', () => {
  it('parses multi-item grocery adds', async () => {
    const c = await run('Add bananas, eggs, and chicken to the grocery list')
    expect(c.intent).toBe('grocery.add')
    expect(c.entities.items).toEqual(['Bananas', 'Eggs', 'Chicken'])
  })

  it('accepts a bare "add …" only inside Groceries', async () => {
    expect((await run('Add milk and bread', ctx({ feature: 'groceries' }))).intent).toBe('grocery.add')
    expect((await run('Add milk and bread', ctx())).intent).not.toBe('grocery.add')
  })

  it('parses grocery removal', async () => {
    const c = await run('Remove bananas from the list')
    expect(c).toMatchObject({ intent: 'grocery.remove', entities: { items: ['Bananas'] } })
  })

  it('parses a calendar event with person, day and time', async () => {
    const c = await run('Add a dentist appointment for Jaime next Tuesday at two')
    expect(c.intent).toBe('calendar.add')
    expect(c.entities).toMatchObject({ title: 'Dentist Appointment', memberId: 'jaime', date: '2026-11-03', startTime: '14:00' })
  })

  it('defaults the person to the selected member', async () => {
    const c = await run('Add soccer practice tomorrow at 4', ctx({ memberId: 'liam' }))
    expect(c.entities).toMatchObject({ memberId: 'liam', startTime: '16:00' })
  })

  it('asks for clarification instead of guessing when a time is missing', async () => {
    const c = await run('Add practice tomorrow')
    expect(c.intent).toBe('unknown')
    expect(c.ambiguity?.options.length).toBeGreaterThan(1)
  })

  it('parses messages to everyone and to one person', async () => {
    expect(await run('Send everyone a message that dinner is at six tonight')).toMatchObject({
      intent: 'message.send',
      entities: { recipientIds: 'everyone', body: 'Dinner is at six tonight' },
    })
    expect((await run('Send Jaime a message that I am running late')).entities.recipientIds).toEqual(['jaime'])
  })

  it('parses reminders and chore completion', async () => {
    expect(await run('Remind Liam to bring his soccer cleats tomorrow')).toMatchObject({
      intent: 'reminder.add',
      entities: { memberId: 'liam', body: 'Bring his soccer cleats', date: '2026-10-30' },
    })
    expect(await run("Mark Ethan's dishes as complete")).toMatchObject({
      intent: 'chore.complete',
      entities: { memberId: 'ethan', title: 'dishes' },
    })
  })

  it('returns unknown for gibberish', async () => {
    expect((await run('purple monkey dishwasher')).intent).toBe('unknown')
  })
})
