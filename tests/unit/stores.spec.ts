import { beforeEach, describe, expect, it } from 'vitest'
import { useCalendarStore } from '@/stores/calendar'
import { useChoreStore } from '@/stores/chores'
import { useFamilyStore } from '@/stores/family'
import { useGroceryStore } from '@/stores/groceries'
import { useMessageStore } from '@/stores/messages'
import { usePhotoStore } from '@/stores/photos'
import { useVoiceStore } from '@/stores/voice'
import { streakDays } from '@/features/chores/scoring'
import { NOW, setup } from './helpers'

const reach = (fn: () => void) => import('vitest').then(({ vi }) => vi.waitFor(fn))

describe('calendar store', () => {
  beforeEach(async () => {
    await setup()
  })

  it('shows recurring events on the right days (Thursday 29 Oct 2026)', () => {
    const titles = useCalendarStore().today.map((e) => e.title)
    expect(titles).toEqual(expect.arrayContaining(['School', 'Work', 'Gym', 'Soccer Practice', 'Nail Appointment']))
    expect(titles).not.toContain('Dance Class') // Saturdays only
  })

  it('navigates by view unit and keeps the selected date across views', () => {
    const cal = useCalendarStore()
    cal.view = 'week'
    cal.step(1)
    expect(cal.title).toBe('NOV 2 – 8, 2026')
    cal.view = 'month'
    cal.step(1)
    expect(cal.title).toBe('December 2026')
    cal.view = 'day'
    cal.goToday()
    expect(cal.title).toBe('Thursday, October 29')
    expect(cal.isCurrent).toBe(true)
  })

  it('filters by the selected family member and keeps the filter across views', () => {
    const cal = useCalendarStore()
    useFamilyStore().select('dad')
    cal.view = 'week'
    const titles = new Set(cal.weekDays.flatMap((d) => cal.onDay(d)).map((e) => e.title))
    expect(titles.has('Work')).toBe(true)
    expect(titles.has('Soccer Practice')).toBe(false)
    cal.view = 'month'
    expect(cal.onDay(NOW).some((e) => e.title === 'Gym')).toBe(true)
  })

  it('adds, edits and deletes an event', async () => {
    const cal = useCalendarStore()
    const start = new Date(2026, 9, 29, 18, 0)
    const saved = await cal.save({ title: 'Dentist', start: start.toISOString(), end: new Date(2026, 9, 29, 19, 0).toISOString(), memberIds: ['liam'], category: 'appointment' })
    expect(cal.today.some((e) => e.id === saved.id)).toBe(true)

    await cal.save({ id: saved.id, title: 'Doctor', start: start.toISOString(), end: new Date(2026, 9, 29, 19, 30).toISOString(), memberIds: ['liam'], category: 'appointment' })
    expect(cal.today.find((e) => e.id === saved.id)?.title).toBe('Doctor')

    await cal.remove(saved.id)
    expect(cal.today.some((e) => e.id === saved.id)).toBe(false)
  })

  it('editing one occurrence changes the series time but keeps past and future repeats', async () => {
    const cal = useCalendarStore()
    const occ = cal.today.find((e) => e.title === 'Soccer Practice')!
    expect(occ.seriesId).toBe('soccer-practice')
    // move today's practice from 4:00 to 5:00 PM
    await cal.save({ ...occ, start: new Date(2026, 9, 29, 17, 0).toISOString(), end: new Date(2026, 9, 29, 18, 30).toISOString() })
    const hours = cal.events.filter((e) => e.seriesId === 'soccer-practice').map((e) => new Date(e.start).getHours())
    expect(new Set(hours)).toEqual(new Set([17]))
    // earlier occurrences still exist (the series start date did not jump to "today")
    expect(cal.events.some((e) => e.seriesId === 'soccer-practice' && new Date(e.start) < new Date(2026, 9, 29))).toBe(true)
  })

  it('deleting any occurrence deletes the whole series', async () => {
    const cal = useCalendarStore()
    await cal.remove('gym#2026-10-29')
    expect(cal.events.some((e) => e.seriesId === 'gym')).toBe(false)
  })
})

describe('chore store: recurrence, editing, history', () => {
  beforeEach(async () => {
    await setup()
  })

  it('only lists chores due today and reports next due dates for the rest', () => {
    const chores = useChoreStore()
    expect(chores.visible.some((c) => c.id === 'c-plants')).toBe(false) // weekly, tomorrow
    const plants = chores.defined.find((r) => r.chore.id === 'c-plants')!
    expect(plants.dueToday).toBe(false)
    expect(plants.next).toBe('2026-10-30')
  })

  it('creates, edits and deletes a chore', async () => {
    const chores = useChoreStore()
    const made = await chores.save({ title: 'Fold the laundry', icon: 'generic', assigneeId: 'jaime', points: 15, dueDate: '2026-10-29', recurrence: { freq: 'daily' } })
    expect(chores.visible.some((c) => c.id === made.id)).toBe(true)
    await chores.save({ ...made, points: 30 })
    expect(chores.chores.find((c) => c.id === made.id)?.points).toBe(30)
    expect((await chores.complete(made.id))?.pointsAwarded).toBe(30)
    await chores.remove(made.id)
    expect(chores.chores.some((c) => c.id === made.id)).toBe(false)
  })

  it('cannot complete a chore that is not due today', async () => {
    expect(await useChoreStore().complete('c-plants')).toBeNull()
  })

  it('tracks history newest first, streaks and badges per member', () => {
    const chores = useChoreStore()
    useFamilyStore().select('liam')
    expect(chores.history[0]!.completedAt >= chores.history[1]!.completedAt).toBe(true)
    expect(chores.streak).toBeGreaterThanOrEqual(2)
    expect(chores.badges.every((b) => b.memberId === 'liam')).toBe(true)
  })

  it('streak counts consecutive days and breaks on a gap', () => {
    const at = (day: number) => ({ id: `${day}`, choreId: 'c', choreTitle: 'c', memberId: 'm', completedAt: new Date(2026, 9, day, 9).toISOString(), occurrenceKey: `c@${day}`, pointsAwarded: 5 })
    expect(streakDays([at(29), at(28), at(27), at(24)], NOW, 'm')).toBe(3)
    expect(streakDays([at(28), at(27)], NOW, 'm')).toBe(2) // nothing yet today: streak is still alive
    expect(streakDays([at(26)], NOW, 'm')).toBe(0)
  })
})

describe('grocery store', () => {
  beforeEach(async () => {
    await setup()
  })

  it('adds, edits quantities/categories, removes and clears purchased', async () => {
    const g = useGroceryStore()
    const before = g.items.length
    await g.add(['Yogurt', 'yogurt'])
    expect(g.items.length).toBe(before + 1) // duplicate skipped
    const yogurt = g.items.find((i) => i.name === 'Yogurt')!
    expect(yogurt.category).toBe('dairy')

    await g.update(yogurt.id, { quantity: 3, unit: 'pack', category: 'pantry' })
    expect(g.items.find((i) => i.id === yogurt.id)).toMatchObject({ quantity: 3, unit: 'pack', category: 'pantry' })

    await g.togglePurchased(yogurt.id)
    expect(g.purchased.map((i) => i.id)).toContain(yogurt.id)
    expect(await g.clearPurchased()).toBe(1)
    expect(g.items.some((i) => i.id === yogurt.id)).toBe(false)
  })

  it('suggestions exclude what is already on the list', () => {
    const g = useGroceryStore()
    expect(g.suggestions).not.toContain('Milk')
    expect(g.suggestions).toContain('Butter')
  })
})

describe('message store', () => {
  beforeEach(async () => {
    await setup()
  })

  it('hides private message bodies on the shared screen, reveals them only to participants', () => {
    const m = useMessageStore()
    const family = useFamilyStore()
    const secret = m.all.find((x) => x.private)!
    expect(m.canReveal(secret)).toBe(false)
    family.select('liam')
    expect(m.all.some((x) => x.id === secret.id)).toBe(false) // not addressed to Liam
    family.select('dad')
    expect(m.canReveal(m.all.find((x) => x.id === secret.id)!)).toBe(true)
  })

  it('filters by member, completes reminders and deletes items', async () => {
    const m = useMessageStore()
    useFamilyStore().select('liam')
    expect(m.all.some((x) => x.text === 'Bring soccer cleats')).toBe(true)
    await m.setReminderDone('r2', true)
    expect(m.feed.some((x) => x.id === 'r2')).toBe(false) // done reminders leave the dashboard…
    expect(m.all.some((x) => x.id === 'r2' && x.done)).toBe(true) // …but stay in the full list
    await m.remove(m.all.find((x) => x.id === 'r2')!)
    expect(m.all.some((x) => x.id === 'r2')).toBe(false)
  })
})

describe('photo store', () => {
  beforeEach(async () => {
    await setup()
  })

  it('scopes to the selected member and toggles favorites', async () => {
    const photos = usePhotoStore()
    const all = photos.visible.length
    useFamilyStore().select('lumen')
    expect(photos.visible.length).toBeLessThan(all)
    expect(photos.visible.every((p) => p.memberIds.includes('lumen'))).toBe(true)
    const id = photos.visible[0]!.id
    const was = photos.visible[0]!.favorite
    await photos.toggleFavorite(id)
    expect(photos.all.find((x) => x.id === id)?.favorite).toBe(!was)
  })
})

describe('voice: notes and recipients', () => {
  beforeEach(async () => {
    await setup()
  })

  it('saves a spoken note, personal when a member is selected', async () => {
    const voice = useVoiceStore()
    await voice.open({ feature: 'messages', route: '/messages', origin: 'local-mic' })
    voice.devScenario('note-add')
    await reach(() => expect(voice.state).toBe('reviewing'))
    expect(voice.proposal?.payload).toMatchObject({ kind: 'note.add', recipientIds: 'everyone', body: 'Library books are due Monday' })
    await voice.confirm()
    expect(useMessageStore().all.some((m) => m.type === 'note' && m.text === 'Library books are due Monday')).toBe(true)
  })

  it('lets the reviewer change who gets a message before it is sent', async () => {
    const voice = useVoiceStore()
    await voice.open({ feature: 'messages', route: '/messages', origin: 'local-mic' })
    await reach(() => expect(voice.state).toBe('reviewing'))
    voice.setRecipients(['jaime', 'liam'])
    expect(voice.proposal?.fields.find((f) => f.label === 'To')?.value).toBe('Jaime, Liam')
    voice.setRecipients([]) // must keep at least one recipient
    expect(voice.proposal?.payload).toMatchObject({ recipientIds: ['jaime', 'liam'] })
    await voice.confirm()
    const sent = useMessageStore().messages.find((m) => m.body.startsWith('Dinner is at six'))
    expect(sent?.recipientIds).toEqual(['jaime', 'liam'])
  })

  it('completes today\'s chore by voice with the right occurrence', async () => {
    const voice = useVoiceStore()
    await voice.open({ feature: 'chores', route: '/tasks', origin: 'local-mic' })
    await reach(() => expect(voice.state).toBe('reviewing'))
    expect(voice.proposal?.payload).toMatchObject({ kind: 'chore.complete', choreId: 'c-table', occurrenceDate: '2026-10-29' })
    const before = useChoreStore().total
    await voice.confirm()
    expect(useChoreStore().total).toBe(before + 10)
  })
})
