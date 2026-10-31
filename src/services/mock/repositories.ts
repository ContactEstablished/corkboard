/**
 * In-memory mock implementations of the repository interfaces, seeded from
 * `data/seed.ts` and optionally persisted to localStorage. These are the ONLY
 * files that know the data is fake; replace them with API-backed classes.
 */

import type { SeedData } from '@/data/seed'
import type {
  Achievement,
  CalendarEvent,
  Chore,
  ChoreCompletion,
  FamilyMember,
  ID,
  Message,
  Photo,
  Reminder,
  ShoppingItem,
  WeatherSnapshot,
} from '@/models'
import { expandEvent } from '@/features/calendar/recurrence'
import { addDays, startOfDay, toISODate } from '@/utils/date'
import { inferGroceryCategory, titleCase } from '@/utils/groceryCategory'
import type {
  CalendarRepository,
  ChoreRepository,
  FamilyRepository,
  GroceryRepository,
  MessageRepository,
  PhotoRepository,
  WeatherService,
} from '../interfaces'
import { type Persistence, noPersistence } from './persistence'

export interface MockOptions {
  now: () => Date
  persistence?: Persistence
}

let counter = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`
/** Deep copy via JSON: tolerant of Vue reactive proxies (structuredClone throws on them) and mirrors a wire round-trip. */
const baseId = (id: string) => id.split('#')[0]!
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Shared plumbing: hydrate from storage or seed, save after each write. */
class Collection<T> {
  constructor(
    private readonly key: string,
    seed: T[],
    private readonly persistence: Persistence,
  ) {
    this.rows = persistence.load<T[]>(key) ?? clone(seed)
  }
  rows: T[]
  save(): void {
    this.persistence.save(this.key, this.rows)
  }
}

export class MockFamilyRepository implements FamilyRepository {
  private readonly c: Collection<FamilyMember>
  constructor(seed: SeedData, opts: MockOptions) {
    this.c = new Collection('members', seed.members, opts.persistence ?? noPersistence)
  }
  async listMembers() {
    return clone(this.c.rows)
  }
  async updatePresence(memberId: ID, presence: FamilyMember['presence']) {
    const m = this.c.rows.find((r) => r.id === memberId)
    if (!m) throw new Error(`Unknown member ${memberId}`)
    m.presence = presence
    this.c.save()
    return clone(m)
  }
}

export class MockCalendarRepository implements CalendarRepository {
  private readonly c: Collection<CalendarEvent>
  constructor(seed: SeedData, opts: MockOptions) {
    this.c = new Collection('events', seed.events, opts.persistence ?? noPersistence)
  }
  async listEvents(from: Date, to: Date) {
    return clone(this.c.rows.flatMap((e) => expandEvent(e, from, to)).sort((a, b) => a.start.localeCompare(b.start)))
  }
  async createEvent(event: Omit<CalendarEvent, 'id'>) {
    if (new Date(event.end) <= new Date(event.start)) throw new Error('Event must end after it starts')
    const created: CalendarEvent = { ...clone(event), id: newId('ev') }
    this.c.rows.push(created)
    this.c.save()
    return clone(created)
  }
  async updateEvent(id: ID, patch: Partial<Omit<CalendarEvent, 'id'>>) {
    const e = this.c.rows.find((r) => r.id === baseId(id))
    if (!e) throw new Error(`Unknown event ${id}`)
    let changes = clone(patch)
    if (id.includes('#') && changes.start) {
      // Editing one occurrence of a series: keep the series' own start date and
      // only adopt the occurrence's new time of day and length.
      const ns = new Date(changes.start)
      const length = new Date(changes.end ?? changes.start).getTime() - ns.getTime()
      const start = new Date(e.start)
      start.setHours(ns.getHours(), ns.getMinutes(), 0, 0)
      changes = { ...changes, start: start.toISOString(), end: new Date(start.getTime() + length).toISOString() }
    }
    const next = { ...e, ...changes }
    if (new Date(next.end) <= new Date(next.start)) throw new Error('Event must end after it starts')
    // Editing one occurrence of a series moves the whole series to the new time of day.
    delete (next as Partial<CalendarEvent>).seriesId
    Object.assign(e, next)
    this.c.save()
    return clone(e)
  }
  async deleteEvent(id: ID) {
    this.c.rows = this.c.rows.filter((r) => r.id !== baseId(id))
    this.c.save()
  }
}

export class MockGroceryRepository implements GroceryRepository {
  private readonly c: Collection<ShoppingItem>
  private readonly suggested: string[]
  private readonly now: () => Date
  constructor(seed: SeedData, opts: MockOptions) {
    this.c = new Collection('groceries', seed.groceries, opts.persistence ?? noPersistence)
    this.suggested = seed.grocerySuggestions
    this.now = opts.now
  }
  async listItems() {
    return clone(this.c.rows)
  }
  /** Skips names already on the (unpurchased) list, so repeated commands are harmless. */
  async addItems(items: (Pick<ShoppingItem, 'name'> & Partial<ShoppingItem>)[], addedBy?: ID) {
    const created: ShoppingItem[] = []
    for (const input of items) {
      const name = titleCase(input.name)
      if (!name) continue
      const dup = [...this.c.rows, ...created].some((r) => !r.purchased && r.name.toLowerCase() === name.toLowerCase())
      if (dup) continue
      created.push({
        quantity: input.quantity,
        unit: input.unit,
        id: newId('gi'),
        name,
        category: input.category ?? inferGroceryCategory(name),
        purchased: false,
        addedBy,
        addedAt: this.now().toISOString(),
      })
    }
    this.c.rows.push(...created)
    this.c.save()
    return clone(created)
  }
  async updateItem(id: ID, patch: Partial<Omit<ShoppingItem, 'id'>>) {
    const item = this.c.rows.find((r) => r.id === id)
    if (!item) throw new Error(`Unknown item ${id}`)
    Object.assign(item, patch)
    this.c.save()
    return clone(item)
  }
  async removeItem(id: ID) {
    this.c.rows = this.c.rows.filter((r) => r.id !== id)
    this.c.save()
  }
  async suggestions() {
    const onList = new Set(this.c.rows.filter((r) => !r.purchased).map((r) => r.name.toLowerCase()))
    return this.suggested.filter((s) => !onList.has(s.toLowerCase()))
  }
}

export class MockChoreRepository implements ChoreRepository {
  private readonly chores: Collection<Chore>
  private readonly completions: Collection<ChoreCompletion>
  private readonly achievements: Achievement[]
  private readonly now: () => Date
  constructor(seed: SeedData, opts: MockOptions) {
    const p = opts.persistence ?? noPersistence
    this.chores = new Collection('chores', seed.chores, p)
    this.completions = new Collection('completions', seed.completions, p)
    this.achievements = seed.achievements
    this.now = opts.now
  }
  async listChores() {
    return clone(this.chores.rows)
  }
  async createChore(chore: Omit<Chore, 'id'>) {
    const created = { ...clone(chore), id: newId('ch') }
    this.chores.rows.push(created)
    this.chores.save()
    return clone(created)
  }
  async updateChore(id: ID, patch: Partial<Omit<Chore, 'id'>>) {
    const c = this.chores.rows.find((r) => r.id === id)
    if (!c) throw new Error(`Unknown chore ${id}`)
    Object.assign(c, patch)
    this.chores.save()
    return clone(c)
  }
  async deleteChore(id: ID) {
    this.chores.rows = this.chores.rows.filter((r) => r.id !== id)
    this.chores.save()
  }
  async listCompletions() {
    return clone(this.completions.rows)
  }
  async recordCompletion(choreId: ID, memberId: ID, at: Date = this.now(), occurrenceDate?: string) {
    const chore = this.chores.rows.find((r) => r.id === choreId)
    if (!chore) throw new Error(`Unknown chore ${choreId}`)
    const occurrenceKey = `${chore.id}@${occurrenceDate ?? chore.dueDate}`
    const existing = this.completions.rows.find((r) => r.occurrenceKey === occurrenceKey)
    if (existing) return { completion: clone(existing), created: false }
    const completion: ChoreCompletion = {
      id: newId('done'),
      choreId: chore.id,
      choreTitle: chore.title,
      memberId,
      completedAt: at.toISOString(),
      occurrenceKey,
      pointsAwarded: chore.points,
    }
    this.completions.rows.push(completion)
    this.completions.save()
    return { completion: clone(completion), created: true }
  }
  async listAchievements(memberId?: ID) {
    return clone(memberId ? this.achievements.filter((a) => a.memberId === memberId) : this.achievements)
  }
}

export class MockMessageRepository implements MessageRepository {
  private readonly messages: Collection<Message>
  private readonly reminders: Collection<Reminder>
  private readonly now: () => Date
  constructor(seed: SeedData, opts: MockOptions) {
    const p = opts.persistence ?? noPersistence
    this.messages = new Collection('messages', seed.messages, p)
    this.reminders = new Collection('reminders', seed.reminders, p)
    this.now = opts.now
  }
  async listMessages() {
    return clone(this.messages.rows)
  }
  async sendMessage(message: Omit<Message, 'id' | 'createdAt'>) {
    if (!message.body.trim()) throw new Error('Message is empty')
    const created: Message = { ...clone(message), id: newId('msg'), createdAt: this.now().toISOString() }
    this.messages.rows.push(created)
    this.messages.save()
    return clone(created)
  }
  async deleteMessage(id: ID) {
    this.messages.rows = this.messages.rows.filter((r) => r.id !== id)
    this.messages.save()
  }
  async listReminders() {
    return clone(this.reminders.rows)
  }
  async createReminder(reminder: Omit<Reminder, 'id' | 'done'>) {
    const created: Reminder = { ...clone(reminder), id: newId('rem'), done: false }
    this.reminders.rows.push(created)
    this.reminders.save()
    return clone(created)
  }
  async deleteReminder(id: ID) {
    this.reminders.rows = this.reminders.rows.filter((r) => r.id !== id)
    this.reminders.save()
  }
  async setReminderDone(id: ID, done: boolean) {
    const r = this.reminders.rows.find((x) => x.id === id)
    if (!r) throw new Error(`Unknown reminder ${id}`)
    r.done = done
    this.reminders.save()
    return clone(r)
  }
}

export class MockPhotoRepository implements PhotoRepository {
  private readonly c: Collection<Photo>
  constructor(seed: SeedData, opts: MockOptions) {
    this.c = new Collection('photos', seed.photos, opts.persistence ?? noPersistence)
  }
  async listPhotos(filter: { memberId?: ID; category?: Photo['category']; favoritesOnly?: boolean } = {}) {
    return clone(
      this.c.rows.filter(
        (p) =>
          (!filter.memberId || p.memberIds.includes(filter.memberId)) &&
          (!filter.category || p.category === filter.category) &&
          (!filter.favoritesOnly || p.favorite),
      ),
    )
  }
  async setFavorite(id: ID, favorite: boolean) {
    const p = this.c.rows.find((r) => r.id === id)
    if (!p) throw new Error(`Unknown photo ${id}`)
    p.favorite = favorite
    this.c.save()
    return clone(p)
  }
  async setCaption(id: ID, caption: string) {
    const p = this.c.rows.find((r) => r.id === id)
    if (!p) throw new Error(`Unknown photo ${id}`)
    p.caption = caption
    this.c.save()
    return clone(p)
  }
}

export class MockWeatherService implements WeatherService {
  constructor(private readonly now: () => Date) {}
  async current(): Promise<WeatherSnapshot> {
    const today = startOfDay(this.now())
    return {
      location: 'Sugar Land, TX',
      temperature: 68,
      condition: 'partly-cloudy',
      conditionLabel: 'Partly Cloudy',
      high: 72,
      low: 55,
      unit: 'F',
      forecast: [
        { condition: 'clear', high: 74, low: 56 },
        { condition: 'partly-cloudy', high: 73, low: 57 },
        { condition: 'rain', high: 66, low: 52 },
        { condition: 'cloudy', high: 64, low: 50 },
        { condition: 'clear', high: 70, low: 51 },
      ].map((f, i) => ({ ...f, date: toISODate(addDays(today, i + 1)), condition: f.condition as WeatherSnapshot['condition'] })),
    }
  }
}
