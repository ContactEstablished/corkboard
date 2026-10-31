import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NavTarget, ProposedAction, VoiceInteractionContext } from '@/models'
import type { ServiceContainer } from '@/services/interfaces'
import { parseNumber, parseRecurrence } from '@/services/intent/RuleBasedIntentInterpreter'
import { useCalendarStore } from '@/stores/calendar'
import { useChoreStore } from '@/stores/chores'
import { useFamilyStore } from '@/stores/family'
import { useMessageStore } from '@/stores/messages'
import { usePreferencesStore } from '@/stores/preferences'
import { useVoiceStore } from '@/stores/voice'
import { NOW, setup } from './helpers'

let svc: ServiceContainer
let navigated: NavTarget[]
let spoken: string[]

const home: VoiceInteractionContext = { feature: 'home', route: '/', origin: 'global-mic' }
const ctx = (over: Partial<VoiceInteractionContext> = {}): VoiceInteractionContext => ({ ...home, ...over })
const reach = (fn: () => void) => vi.waitFor(fn)

/** Interpret + validate a phrase exactly as the voice pipeline does (minus speech capture). */
async function plan(text: string, c: VoiceInteractionContext = home) {
  const members = useFamilyStore().members
  const command = await svc.interpreter.interpret(text, c, members, svc.now())
  return { command, result: await svc.validator.validate(command, c, members) }
}
async function action(text: string, c: VoiceInteractionContext = home): Promise<ProposedAction> {
  const { result } = await plan(text, c)
  if (!result.ok) throw new Error(`Expected an action for "${text}", got ${result.reason}: ${result.message}`)
  return result.action
}

beforeEach(async () => {
  navigated = []
  spoken = []
  svc = await setup({ feedback: { speak: (t) => void spoken.push(t), cancel: () => {} } })
  svc.navigation = { go: async (t) => void navigated.push(t) }
})

describe('the ten example commands from the spec', () => {
  it('1. adds several groceries to the shopping list', async () => {
    const a = await action('Add milk, eggs, bananas, and chicken to the shopping list.')
    expect(a).toMatchObject({ kind: 'grocery.add', confirmLabel: 'Add 4 Items' })
    expect(a.items).toEqual(['Milk', 'Eggs', 'Bananas', 'Chicken'])
  })

  it('2. removes bananas from the list (destructive, so it needs confirmation)', async () => {
    const a = await action('Remove bananas from the list.')
    expect(a).toMatchObject({ kind: 'grocery.remove', destructive: true, items: ['Bananas'] })
  })

  it('3. assigns a chore with a weekday repeat and points', async () => {
    const { command } = await plan('Assign Liam to take out the trash every Wednesday for twenty points.')
    expect(command).toMatchObject({
      intent: 'chore.assign',
      entities: { memberId: 'liam', title: 'Take out the trash', points: 20, rule: { freq: 'weekly', byWeekday: [3] } },
    })
    const a = await action('Assign Ethan to take out the trash every Wednesday for twenty points.')
    expect(a.payload).toMatchObject({ kind: 'chore.assign', assigneeId: 'ethan', points: 20, icon: 'trash' })
    expect(a.fields.find((f) => f.label === 'Repeat')?.value).toBe('Every Wed')
  })

  it('4. marks Ethan’s dishes complete', async () => {
    const a = await action("Mark Ethan's dishes as complete.")
    expect(a.payload).toMatchObject({ kind: 'chore.complete', choreId: 'c-dishes-e', memberId: 'ethan' })
  })

  it('5. adds a dentist appointment for Jaime next Tuesday at two', async () => {
    const a = await action('Add a dentist appointment for Jaime next Tuesday at two.')
    expect(a.payload).toMatchObject({ kind: 'calendar.add', title: 'Dentist Appointment', memberIds: ['jaime'], category: 'appointment' })
    expect(new Date((a.payload as { start: string }).start).getHours()).toBe(14)
  })

  it('6. shows next week', async () => {
    const a = await action('Show me next week.')
    expect(a.autoRun).toBe(true)
    expect(a.payload).toMatchObject({ kind: 'navigate', target: { route: '/calendar', calendarView: 'week', date: '2026-11-02' } })
  })

  it('7. sends everyone a message, showing recipients and content first', async () => {
    const a = await action('Send everyone a message that dinner is at six tonight.')
    expect(a).toMatchObject({ kind: 'message.send', outgoing: true })
    expect(a.fields.map((f) => f.value)).toContain('Everyone')
  })

  it('8. reminds Liam to bring his cleats tomorrow', async () => {
    const a = await action('Remind Liam to bring his soccer cleats tomorrow.')
    expect(a.payload).toMatchObject({ kind: 'reminder.add', targetId: 'liam', text: 'Bring his soccer cleats' })
  })

  it('9. shows Lumen’s activities this weekend', async () => {
    const a = await action('Show me Lumen’s activities this weekend.')
    expect(a.payload).toMatchObject({ kind: 'navigate', target: { route: '/calendar', memberId: 'lumen', calendarView: 'week', date: '2026-10-31' } })
  })

  it('10. opens Liam’s soccer photos', async () => {
    const a = await action('Open Liam’s soccer photos.')
    expect(a.payload).toMatchObject({ kind: 'navigate', target: { route: '/photos', memberId: 'liam', photoFilter: 'sports' } })
  })
})

describe('more navigation phrasings', () => {
  it.each([
    ['Show me tomorrow', { route: '/calendar', calendarView: 'day', date: '2026-10-30' }],
    ['Show me next month', { route: '/calendar', calendarView: 'month' }],
    ['Show me Friday', { route: '/calendar', calendarView: 'day', date: '2026-10-30' }],
    ['Open the grocery list', { route: '/groceries' }],
    ['Show me Ethan’s chores', { route: '/tasks', memberId: 'ethan' }],
    ['Show me Dad', { route: '/', memberId: 'dad' }],
    ['Go to the family home', { route: '/', memberId: null }],
  ])('%s', async (phrase, target) => {
    const a = await action(phrase)
    expect((a.payload as { target: NavTarget }).target).toMatchObject(target)
  })
})

describe('parsing helpers', () => {
  it('reads spoken numbers and recurrence phrases', () => {
    expect(parseNumber('twenty')).toBe(20)
    expect(parseNumber('twenty five')).toBe(25)
    expect(parseNumber('15')).toBe(15)
    expect(parseNumber('banana')).toBeUndefined()
    expect(parseRecurrence('monday and thursday', NOW)).toEqual({ freq: 'weekly', byWeekday: [1, 4] })
    expect(parseRecurrence('evening', NOW)).toEqual({ freq: 'daily' })
    expect(parseRecurrence('weekday', NOW)).toEqual({ freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] })
    expect(parseRecurrence('week', NOW)).toEqual({ freq: 'weekly', byWeekday: [4] })
  })
})

describe('voice-driven edits', () => {
  it('assigns and deletes a chore', async () => {
    const chores = useChoreStore()
    const voice = useVoiceStore()
    const assign = await action('Give Ethan the laundry chore every evening for 15 points')
    expect(assign.payload).toMatchObject({ kind: 'chore.assign', title: 'Laundry', points: 15, recurrence: { freq: 'daily' } })
    await svc.executor.execute(assign)
    await chores.load()
    const made = chores.chores.find((c) => c.title === 'Laundry')!
    expect(made).toMatchObject({ assigneeId: 'ethan', points: 15 })

    const remove = await action('Delete the laundry chore')
    expect(remove).toMatchObject({ kind: 'chore.remove', destructive: true })
    await svc.executor.execute(remove)
    await chores.load()
    expect(chores.chores.some((c) => c.id === made.id)).toBe(false)
    expect(voice.state).toBe('closed')
  })

  it('refuses to assign a duplicate and rejects out-of-range points', async () => {
    expect((await plan('Assign Liam to take out the trash')).result).toMatchObject({ ok: false, reason: 'invalid' })
    expect((await plan('Assign Jaime to paint the fence for 500 points')).result).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('moves a repeating event: only the time changes, for every repeat', async () => {
    const cal = useCalendarStore()
    const a = await action('Move soccer practice to 5 PM', ctx({ feature: 'calendar' }))
    expect(a.kind).toBe('calendar.move')
    expect(a.fields.find((f) => f.label === 'Now')?.value).toContain('every repeat')
    await svc.executor.execute(a)
    await cal.load(true)
    expect(new Set(cal.events.filter((e) => e.seriesId === 'soccer-practice').map((e) => new Date(e.start).getHours()))).toEqual(new Set([17]))
  })

  it('cancels a one-off event only after confirmation, and warns when it repeats', async () => {
    const dentist = await action('Cancel the dentist appointment')
    expect(dentist).toMatchObject({ kind: 'calendar.remove', destructive: true, title: 'Cancel this event?' })
    const gym = await action('Cancel gym')
    expect(gym).toMatchObject({ kind: 'calendar.remove', title: 'Cancel every repeat?' })

    const cal = useCalendarStore()
    await svc.executor.execute(dentist)
    await cal.load(true)
    expect(cal.events.some((e) => e.id === 'dentist')).toBe(false)
  })

  it('resolves "it" from the event that was open when the mic was pressed', async () => {
    const a = await action('Cancel it', ctx({ feature: 'calendar', entityId: 'dentist' }))
    expect(a.payload).toMatchObject({ kind: 'calendar.remove', eventId: 'dentist' })
    const none = await plan('Cancel it', ctx({ feature: 'calendar' }))
    expect(none.result).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('will not move an event into the past', async () => {
    await useCalendarStore().save({
      title: 'Parent Meeting',
      start: new Date(2026, 9, 29, 18, 0).toISOString(),
      end: new Date(2026, 9, 29, 19, 0).toISOString(),
      memberIds: [],
      category: 'other',
    })
    // It is 9:00 AM in these tests, so 7 AM today has already passed.
    const { result } = await plan('Move the parent meeting to 7 am', ctx({ feature: 'calendar' }))
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
  })

  it('deletes a public message by topic, and never matches private ones', async () => {
    const del = await action('Delete the message about pizza')
    expect(del).toMatchObject({ kind: 'message.remove', destructive: true })
    await svc.executor.execute(del)
    const messages = useMessageStore()
    await messages.load()
    expect(messages.messages.some((m) => m.body.includes('Pizza'))).toBe(false)

    const secret = await plan('Delete the message about insurance')
    expect(secret.result).toMatchObject({ ok: false, reason: 'invalid' })
  })
})

describe('clarifying questions', () => {
  it('turns an ambiguous request into tappable options, then asks for the missing time', async () => {
    const voice = useVoiceStore()
    await voice.open(home)
    voice.devScenario('ambiguous-event')
    await reach(() => expect(voice.state).toBe('clarifying'))
    expect(voice.clarification?.options.map((o) => o.label)).toEqual(['Add a calendar event', 'Assign a chore', 'Set a reminder', 'Send a message'])

    voice.answerClarification(0) // calendar event → still needs a time
    await reach(() => expect(voice.clarification?.question).toContain('What time'))
    const four = voice.clarification!.options.findIndex((o) => o.label === '4:00 PM')
    voice.answerClarification(four)
    await reach(() => expect(voice.state).toBe('reviewing'))
    expect(voice.proposal?.payload).toMatchObject({ kind: 'calendar.add', title: 'Practice' })
    expect(new Date((voice.proposal!.payload as { start: string }).start).getHours()).toBe(16)

    const cal = useCalendarStore()
    const before = cal.events.length
    await voice.confirm()
    expect(cal.events.length).toBe(before + 1) // committed only after the user confirmed
  })

  it('asks who should get a message when no recipient is known', async () => {
    const voice = useVoiceStore()
    await voice.open(home)
    voice.devScenario('ambiguous-event')
    await reach(() => expect(voice.state).toBe('clarifying'))
    voice.answerClarification(3) // Send a message
    await reach(() => expect(voice.clarification?.question).toBe('Who should get this message?'))
    expect(voice.clarification!.options[0]!.label).toBe('Everyone')
    voice.answerClarification(1) // Dad
    await reach(() => expect(voice.state).toBe('reviewing'))
    expect(voice.proposal?.payload).toMatchObject({ kind: 'message.send', recipientIds: ['dad'] })
  })

  it('offers each match when a request names more than one thing', async () => {
    const { result } = await plan('Cancel soccer')
    expect(result.ok).toBe(false)
    if (result.ok || result.reason !== 'clarify') throw new Error('expected a clarification')
    expect(result.clarification.options.map((o) => o.label).sort()).toEqual(['Soccer Game', 'Soccer Practice'])
    expect(result.clarification.options[0]!.detail).toMatch(/\d/) // each option says when
  })

  it('on the calendar screen, a missing time is asked about instead of the intent', async () => {
    const { result } = await plan('Add soccer practice tomorrow', ctx({ feature: 'calendar' }))
    expect(result).toMatchObject({ ok: false, reason: 'clarify' })
  })

  it('"Start over" returns to listening, and answers are ignored outside the question', async () => {
    const voice = useVoiceStore()
    await voice.open(home)
    voice.devScenario('ambiguous-event')
    await reach(() => expect(voice.state).toBe('clarifying'))
    voice.retry()
    await reach(() => expect(voice.state).not.toBe('clarifying'))
    voice.answerClarification(0) // stale tap: nothing happens
    expect(voice.state).not.toBe('clarifying')
  })
})

describe('dictation into form fields', () => {
  it('returns the confirmed text to the caller and changes no data', async () => {
    const voice = useVoiceStore()
    const cal = useCalendarStore()
    const before = cal.events.length
    const got = vi.fn()
    await voice.open(ctx({ feature: 'calendar', field: 'event.title', operation: 'edit' }), { onDictation: got })
    await reach(() => expect(voice.state).toBe('reviewing'))
    expect(voice.proposal).toMatchObject({ kind: 'dictation', confirmLabel: 'Use This Title' })
    expect(got).not.toHaveBeenCalled() // reviewed first

    await voice.confirm()
    expect(got).toHaveBeenCalledWith('Soccer tournament')
    expect(cal.events.length).toBe(before)
    expect(voice.state).toBe('success')
  })

  it('discards the text when the user cancels', async () => {
    const voice = useVoiceStore()
    const got = vi.fn()
    await voice.open(ctx({ feature: 'photos', field: 'photo.caption', entityId: 'p1' }), { onDictation: got })
    await reach(() => expect(voice.state).toBe('reviewing'))
    voice.close()
    expect(got).not.toHaveBeenCalled()
  })

  it('does not interpret a dictated title as a command', async () => {
    const { command } = await plan('Delete everything', ctx({ field: 'chore.title' }))
    expect(command).toMatchObject({ intent: 'dictation', entities: { body: 'Delete everything' } })
  })
})

describe('navigation commands', () => {
  it('run without a review step, via the navigation service', async () => {
    const voice = useVoiceStore()
    await voice.open(home)
    voice.devScenario('show-week')
    await reach(() => expect(voice.state).toBe('success'))
    expect(navigated).toHaveLength(1)
    expect(navigated[0]).toMatchObject({ route: '/calendar', calendarView: 'week' })
    expect(voice.resultMessage).toContain('Calendar')
  })

  it('reports a failure instead of claiming success when navigation throws', async () => {
    svc.navigation = { go: async () => { throw new Error('nope') } }
    const voice = useVoiceStore()
    await voice.open(home)
    voice.devScenario('show-week')
    await reach(() => expect(voice.state).toBe('error'))
    expect(voice.error?.code).toBe('execution-failed')
  })
})

describe('spoken replies', () => {
  it('stay silent unless the user turns them on', async () => {
    const voice = useVoiceStore()
    await voice.open(ctx({ feature: 'groceries', route: '/groceries' }))
    await reach(() => expect(voice.state).toBe('reviewing'))
    await voice.confirm()
    expect(spoken).toEqual([])
  })

  it('speak the result when enabled', async () => {
    usePreferencesStore().speakReplies = true
    const voice = useVoiceStore()
    await voice.open(ctx({ feature: 'groceries', route: '/groceries' }))
    await reach(() => expect(voice.state).toBe('reviewing'))
    await voice.confirm()
    expect(spoken.at(-1)).toContain('Added 3 items')
  })

  it('also read out clarifying questions', async () => {
    usePreferencesStore().speakReplies = true
    const voice = useVoiceStore()
    await voice.open(home)
    voice.devScenario('ambiguous-event')
    await reach(() => expect(voice.state).toBe('clarifying'))
    expect(spoken.at(-1)).toContain('Which did you mean')
  })
})
