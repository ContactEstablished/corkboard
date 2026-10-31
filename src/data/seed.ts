/**
 * Demo data. Everything is generated relative to `now`, so the home screen
 * always looks "live" regardless of the date it is opened on.
 */

import type {
  Achievement,
  CalendarEvent,
  Chore,
  ChoreCompletion,
  FamilyMember,
  Message,
  Photo,
  Reminder,
  ShoppingItem,
} from '@/models'
import { addDays, at, startOfDay, toISODate } from '@/utils/date'

export const MEMBER_IDS = { dad: 'dad', jaime: 'jaime', liam: 'liam', ethan: 'ethan', lumen: 'lumen' } as const

export interface SeedData {
  members: FamilyMember[]
  events: CalendarEvent[]
  groceries: ShoppingItem[]
  chores: Chore[]
  completions: ChoreCompletion[]
  achievements: Achievement[]
  messages: Message[]
  reminders: Reminder[]
  photos: Photo[]
  grocerySuggestions: string[]
}

const adultPerms = { fullAccess: true, kidsMode: false, limitedPurchases: false, visibleOnKiosk: true }
const standardPerms = { fullAccess: false, kidsMode: false, limitedPurchases: true, visibleOnKiosk: true }
const kidPerms = { fullAccess: false, kidsMode: true, limitedPurchases: true, visibleOnKiosk: true }

export function seedMembers(): FamilyMember[] {
  return [
    { id: MEMBER_IDS.dad, name: 'Dad', role: 'administrator', accent: 'blue', presence: 'home', permissions: adultPerms },
    { id: MEMBER_IDS.jaime, name: 'Jaime', role: 'member', accent: 'magenta', presence: 'home', permissions: standardPerms },
    {
      id: MEMBER_IDS.liam,
      name: 'Liam',
      role: 'member',
      accent: 'teal',
      age: 12,
      presence: 'school',
      permissions: kidPerms,
      profile: { interests: ['Soccer Player', 'Gamer', 'Adventurer', 'Future Engineer'], motto: 'Play hard. Be kind. Keep exploring!' },
    },
    { id: MEMBER_IDS.ethan, name: 'Ethan', role: 'member', accent: 'amber', age: 9, presence: 'school', permissions: kidPerms },
    { id: MEMBER_IDS.lumen, name: 'Lumen', role: 'member', accent: 'violet', age: 7, presence: 'home', permissions: kidPerms },
  ]
}

function ev(
  id: string,
  title: string,
  day: Date,
  [sh, sm]: [number, number],
  [eh, em]: [number, number],
  memberIds: string[],
  category: CalendarEvent['category'],
  extra: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    title,
    start: at(day, sh, sm).toISOString(),
    end: at(day, eh, em).toISOString(),
    memberIds,
    category,
    ...extra,
  }
}

function seedEvents(now: Date): CalendarEvent[] {
  const today = startOfDay(now)
  // Series begin well in the past so earlier weeks/months have content too.
  const origin = addDays(today, -70)
  const { dad, jaime, liam, ethan, lumen } = MEMBER_IDS
  const everyone = [dad, jaime, liam, ethan, lumen]
  const weekly = (
    id: string,
    title: string,
    s: [number, number],
    e: [number, number],
    who: string[],
    cat: CalendarEvent['category'],
    byWeekday: number[],
    extra: Partial<CalendarEvent> = {},
  ) => ev(id, title, origin, s, e, who, cat, { recurrence: { freq: 'weekly', byWeekday }, ...extra })

  return [
    weekly('school', 'School', [8, 0], [15, 0], [liam, ethan, lumen], 'school', [1, 2, 3, 4, 5], { location: 'School' }),
    weekly('work', 'Work', [8, 30], [12, 0], [dad], 'work', [1, 2, 3, 4, 5]),
    weekly('gym', 'Gym', [6, 0], [7, 30], [dad], 'fitness', [1, 3, 4]),
    weekly('soccer-practice', 'Soccer Practice', [16, 0], [17, 30], [liam], 'activity', [2, 4], { location: 'Riverside Field' }),
    weekly('nail', 'Nail Appointment', [13, 0], [14, 30], [jaime], 'appointment', [4, 6]),
    weekly('guitar', 'Guitar Lesson', [17, 0], [18, 0], [ethan], 'activity', [3]),
    weekly('homework', 'Homework', [19, 0], [20, 0], [liam], 'school', [1, 3], { location: 'Math Chapter 5' }),
    weekly('movie-fri', 'Movie Night', [19, 0], [20, 30], everyone, 'home', [5], { location: 'Home' }),
    weekly('soccer-game', 'Soccer Game', [10, 0], [11, 30], [liam], 'activity', [6], { location: 'Riverside Field' }),
    weekly('dance', 'Dance Class', [14, 0], [15, 0], [lumen], 'activity', [6]),
    weekly('pizza', 'Family Pizza Night', [18, 0], [19, 0], everyone, 'home', [6], { location: 'Home' }),
    weekly('movie-sun', 'Family Movie Night', [19, 0], [20, 30], everyone, 'home', [0], { location: 'Home' }),
    ev('dentist', 'Dentist Appointment', addDays(today, 5), [15, 0], [16, 0], [liam], 'appointment', { location: 'Sugar Land Dental' }),
    ev('trash', 'Trash Pickup', addDays(today, 1), [7, 0], [7, 30], [dad], 'home'),
    {
      id: 'science',
      title: 'Science Project Due',
      start: at(addDays(today, 2), 0).toISOString(),
      end: at(addDays(today, 2), 23, 59).toISOString(),
      allDay: true,
      memberIds: [liam],
      category: 'school',
      location: 'School',
    },
  ]
}

function seedChores(now: Date): Chore[] {
  const due = toISODate(now)
  const dow = now.getDay()
  const daily = { freq: 'daily' as const }
  // Fires today and three days later, so the list is never empty on any weekday.
  const twiceWeekly = { freq: 'weekly' as const, byWeekday: [dow, (dow + 3) % 7] }
  const onceWeekly = (d: number) => ({ freq: 'weekly' as const, byWeekday: [d] })
  const chore = (c: Omit<Chore, 'dueDate'>): Chore => ({ ...c, dueDate: due })
  const { dad, jaime, liam, ethan, lumen } = MEMBER_IDS
  return [
    chore({ id: 'c-room', title: 'Clean your room', detail: 'Upstairs', icon: 'bed', assigneeId: liam, points: 25, recurrence: twiceWeekly }),
    chore({ id: 'c-trash', title: 'Take out the trash', detail: 'Outside', icon: 'trash', assigneeId: liam, points: 20, recurrence: twiceWeekly }),
    chore({ id: 'c-dog', title: 'Feed the dog', detail: 'Morning & evening', icon: 'pet', assigneeId: ethan, points: 15, recurrence: daily }),
    chore({ id: 'c-table', title: 'Set the table', detail: 'Dinner time', icon: 'table', assigneeId: lumen, points: 10, recurrence: daily }),
    chore({ id: 'c-bath', title: 'Clean bathroom', detail: 'Upstairs', icon: 'bath', assigneeId: ethan, points: 25, recurrence: twiceWeekly }),
    chore({ id: 'c-vac', title: 'Vacuum upstairs', detail: 'This week', icon: 'vacuum', assigneeId: dad, points: 25, recurrence: twiceWeekly }),
    chore({ id: 'c-plants', title: 'Water the plants', detail: 'Living room', icon: 'plants', assigneeId: jaime, points: 15, recurrence: onceWeekly((dow + 1) % 7) }),
    chore({ id: 'c-dishes', title: 'Load the dishwasher', detail: 'After dinner', icon: 'dishes', assigneeId: liam, points: 10, recurrence: daily }),
  ]
}

/** Past completions per member, as `[daysAgo, points]`. Liam sums to 310 pts. */
const HISTORY: Record<string, [number, number][]> = {
  liam: [[1, 25], [1, 15], [2, 20], [3, 20], [4, 10], [5, 25], [6, 15], [8, 20], [9, 10], [10, 25], [11, 15], [12, 20], [14, 25], [15, 15], [16, 15], [18, 20], [20, 15]],
  jaime: [[1, 15], [2, 15], [4, 25], [6, 15], [9, 15], [12, 20], [15, 15]],
  ethan: [[1, 15], [2, 10], [3, 15], [5, 25], [7, 10], [9, 15], [11, 15], [13, 10]],
  lumen: [[1, 10], [2, 10], [4, 10], [6, 10], [8, 10]],
  dad: [[2, 25], [5, 25], [9, 25], [13, 25]],
}

function seedCompletions(now: Date, chores: Chore[]): ChoreCompletion[] {
  const out: ChoreCompletion[] = []
  const titles = ['Clean your room', 'Take out the trash', 'Feed the dog', 'Set the table', 'Clean bathroom', 'Vacuum upstairs', 'Water the plants']
  for (const [memberId, rows] of Object.entries(HISTORY)) {
    rows.forEach(([daysAgo, points], i) => {
      const when = at(addDays(startOfDay(now), -daysAgo), 7 + (i % 10), 15)
      out.push({
        id: `h-${memberId}-${i}`,
        choreId: `hist-${memberId}-${i}`,
        choreTitle: titles[(i + memberId.length) % titles.length]!,
        memberId,
        completedAt: when.toISOString(),
        occurrenceKey: `hist-${memberId}-${i}@${toISODate(when)}`,
        pointsAwarded: points,
      })
    })
  }

  // Two chores already finished earlier today.
  const earlier = (c: Chore, minsAgo: number): ChoreCompletion => ({
    id: `today-${c.id}`,
    choreId: c.id,
    choreTitle: c.title,
    memberId: c.assigneeId,
    completedAt: new Date(now.getTime() - minsAgo * 60_000).toISOString(),
    occurrenceKey: `${c.id}@${c.dueDate}`,
    pointsAwarded: c.points,
  })
  const room = chores.find((c) => c.id === 'c-room')
  const dog = chores.find((c) => c.id === 'c-dog')
  if (room) out.push(earlier(room, 25))
  if (dog) out.push(earlier(dog, 45))
  return out
}

function seedAchievements(now: Date): Achievement[] {
  const d = now.toISOString()
  const liam = MEMBER_IDS.liam
  return [
    { id: 'a1', memberId: liam, title: 'Soccer Star', description: 'Attend 10 soccer events', icon: 'soccer', level: 3, earnedAt: d },
    { id: 'a2', memberId: liam, title: 'Homework Hero', description: 'Finish homework 7 days running', icon: 'book', level: 2, earnedAt: d },
    { id: 'a3', memberId: liam, title: 'Outdoor Explorer', description: 'Log 5 outdoor activities', icon: 'mountain', level: 1, earnedAt: d },
    { id: 'a4', memberId: liam, title: 'Kind Friend', description: 'Help someone in the family', icon: 'users', level: 2, earnedAt: d },
    { id: 'a5', memberId: liam, title: 'Clean Streak', description: 'Complete 5 cleaning chores in a row', icon: 'broom', level: 1, earnedAt: d },
    { id: 'a6', memberId: MEMBER_IDS.ethan, title: 'Pet Pal', description: 'Feed the dog 7 days running', icon: 'star', level: 1, earnedAt: d },
    { id: 'a7', memberId: MEMBER_IDS.lumen, title: 'Table Setter', description: 'Set the table 5 times', icon: 'star', level: 1, earnedAt: d },
    { id: 'a8', memberId: MEMBER_IDS.jaime, title: 'Green Thumb', description: 'Water the plants 4 weeks running', icon: 'star', level: 2, earnedAt: d },
  ]
}

function seedGroceries(now: Date): ShoppingItem[] {
  const t = now.toISOString()
  const item = (id: string, name: string, category: ShoppingItem['category'], extra: Partial<ShoppingItem> = {}): ShoppingItem => ({
    id, name, category, purchased: false, addedAt: t, ...extra,
  })
  return [
    item('g1', 'Milk', 'dairy', { quantity: 1, unit: 'gal' }),
    item('g2', 'Bananas', 'produce', { quantity: 6 }),
    item('g3', 'Eggs', 'dairy', { quantity: 12 }),
    item('g4', 'Bread', 'pantry'),
    item('g5', 'Chicken', 'meat', { quantity: 2, unit: 'lb' }),
    item('g6', 'Apples', 'produce', { quantity: 5 }),
    item('g7', 'Cheese', 'dairy'),
    item('g8', 'Frozen peas', 'frozen'),
    item('g9', 'Paper towels', 'household'),
  ]
}

function seedMessages(now: Date): { messages: Message[]; reminders: Reminder[] } {
  const ago = (mins: number) => new Date(now.getTime() - mins * 60_000).toISOString()
  const { dad, jaime, liam, lumen } = MEMBER_IDS
  return {
    messages: [
      { id: 'm1', kind: 'message', senderId: jaime, recipientIds: 'everyone', body: "Don't forget picture day tomorrow!", createdAt: ago(10) },
      { id: 'm2', kind: 'announcement', senderId: dad, recipientIds: 'everyone', body: 'Pizza for dinner tonight!', createdAt: ago(62) },
      { id: 'm3', kind: 'message', senderId: liam, recipientIds: 'everyone', body: 'Soccer practice at 4 PM. Bring cleats.', createdAt: ago(185) },
      { id: 'm4', kind: 'message', senderId: lumen, recipientIds: 'everyone', body: 'Can someone pick me up at 5?', createdAt: ago(300) },
      { id: 'm5', kind: 'message', senderId: jaime, recipientIds: [dad], body: 'Insurance paperwork is on the desk.', createdAt: ago(240), private: true },
      { id: 'm6', kind: 'note', senderId: dad, recipientIds: 'everyone', body: 'Wi-Fi password is on the fridge.', createdAt: ago(60 * 26) },
      { id: 'm7', kind: 'message', senderId: dad, recipientIds: [liam], body: 'Great job on your math test!', createdAt: ago(60 * 5) },
    ],
    reminders: [
      { id: 'r1', text: 'Trash pickup is tomorrow morning', createdBy: dad, dueAt: ago(-60 * 14), done: false },
      { id: 'r2', text: 'Bring soccer cleats', targetId: liam, createdBy: jaime, dueAt: ago(-60 * 3), done: false },
      { id: 'r3', text: 'Library books due Monday', createdBy: jaime, dueAt: ago(-60 * 40), done: false },
    ],
  }
}

type Scene = 'field' | 'dog' | 'lake' | 'snow' | 'sunset' | 'camp' | 'school' | 'family'

/** Procedural placeholder "photos": sky gradient, sun and layered hills. */
function svgPhoto(hue: number, label: string, scene: Scene): string {
  const sunY = scene === 'sunset' ? 150 : 64
  const rugged = scene === 'snow' || scene === 'lake' || scene === 'camp'
  const hills = rugged
    ? `<path d="M0 170 L70 100 L120 150 L190 80 L260 150 L320 120 V220 H0Z" fill="hsl(${hue} 35% 22%)"/>`
    : `<path d="M0 160 Q80 110 160 150 T320 140 V220 H0Z" fill="hsl(${hue} 45% 20%)"/>`
  const ground = `<path d="M0 185 Q120 165 320 190 V220 H0Z" fill="hsl(${(hue + 20) % 360} 40% 12%)"/>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 65% 38%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 70% 62%)"/></linearGradient></defs>` +
    `<rect width="320" height="220" fill="url(#g)"/><circle cx="240" cy="${sunY}" r="24" fill="hsl(45 95% 75%)" opacity=".9"/>${hills}${ground}` +
    `<title>${label}</title></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function seedPhotos(now: Date): Photo[] {
  const t = (d: number) => addDays(now, -d).toISOString()
  const { dad, jaime, liam, ethan, lumen } = MEMBER_IDS
  const mk = (id: string, caption: string, category: Photo['category'], hue: number, scene: Scene, d: number, who: string[], fav = false): Photo => ({
    id, caption, category, favorite: fav, memberIds: who, takenAt: t(d), url: svgPhoto(hue, caption, scene),
  })
  return [
    mk('p1', 'Soccer game', 'sports', 130, 'field', 3, [liam], true),
    mk('p2', 'Buddy the dog', 'pets', 35, 'dog', 6, [liam, ethan]),
    mk('p3', 'Mountain lake', 'trips', 200, 'lake', 20, [liam, dad], true),
    mk('p4', 'Ski day', 'trips', 210, 'snow', 60, [liam, dad]),
    mk('p5', 'Sunset walk', 'family', 15, 'sunset', 45, [liam, jaime]),
    mk('p6', 'Camping trip', 'trips', 160, 'camp', 90, [liam, ethan, dad], true),
    mk('p7', 'Science fair', 'school', 270, 'school', 12, [liam]),
    mk('p8', 'Goal celebration', 'sports', 120, 'field', 9, [liam, ethan]),
    mk('p9', 'Dance recital', 'school', 320, 'school', 15, [lumen, jaime], true),
    mk('p10', 'Garden day', 'family', 100, 'family', 8, [lumen, jaime]),
    mk('p11', 'Guitar practice', 'school', 25, 'school', 5, [ethan]),
    mk('p12', 'Beach morning', 'trips', 190, 'sunset', 120, [dad, jaime, liam, ethan, lumen]),
    mk('p13', 'Pancake Sunday', 'family', 30, 'family', 2, [dad, jaime, lumen]),
  ]
}

export function createSeedData(now: Date): SeedData {
  const chores = seedChores(now)
  const { messages, reminders } = seedMessages(now)
  return {
    members: seedMembers(),
    events: seedEvents(now),
    groceries: seedGroceries(now),
    chores,
    completions: seedCompletions(now, chores),
    achievements: seedAchievements(now),
    messages,
    reminders,
    photos: seedPhotos(now),
    grocerySuggestions: ['Milk', 'Bananas', 'Eggs', 'Bread', 'Butter', 'Yogurt', 'Rice', 'Pasta'],
  }
}
