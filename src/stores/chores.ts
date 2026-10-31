import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { nextDueDate, occurrenceOn } from '@/features/chores/occurrence'
import { FAMILY_WEEKLY_GOAL, completionsInWeek, levelFor, streakDays, totalPoints, uniqueCompletions, weeklyPoints } from '@/features/chores/scoring'
import type { Achievement, Chore, ChoreCompletion, ID } from '@/models'
import { getServices } from '@/services/container'
import { toISODate } from '@/utils/date'
import { useClockStore } from './clock'
import { useFamilyStore } from './family'

export const useChoreStore = defineStore('chores', () => {
  const clock = useClockStore()
  const family = useFamilyStore()

  const chores = ref<Chore[]>([])
  const completions = ref<ChoreCompletion[]>([])
  const achievements = ref<Achievement[]>([])
  /** Chores with a request in flight (blocks accidental double taps). */
  const pending = ref(new Set<ID>())

  async function load() {
    const repo = getServices().chores
    ;[chores.value, completions.value, achievements.value] = await Promise.all([
      repo.listChores(),
      repo.listCompletions(),
      repo.listAchievements(),
    ])
  }

  const doneKeys = computed(() => new Set(completions.value.map((c) => c.occurrenceKey)))
  const todayISO = computed(() => toISODate(clock.today))

  /** The occurrence date this chore represents *today*, or null when it isn't due. */
  const occurrence = (c: Chore) => occurrenceOn(c, clock.today, doneKeys.value)
  const isDone = (c: Chore) => {
    const occ = occurrence(c)
    return occ !== null && doneKeys.value.has(`${c.id}@${occ}`)
  }
  const inScope = (c: Chore) => !family.selectedId || c.assigneeId === family.selectedId

  /** Chores due today (any assignee), open ones first. */
  const dueTodayAll = computed(() => chores.value.filter((c) => occurrence(c) !== null))
  /** Due today within the member filter, open ones first. Used by the dashboards. */
  const visible = computed(() =>
    dueTodayAll.value
      .filter(inScope)
      .slice()
      .sort((a, b) => Number(isDone(a)) - Number(isDone(b))),
  )
  const openCount = computed(() => visible.value.filter((c) => !isDone(c)).length)

  /** Every defined chore in the filter, with its next due date (for the Chores modal's "All" tab). */
  const defined = computed(() =>
    chores.value.filter(inScope).map((c) => ({ chore: c, next: nextDueDate(c, clock.today), done: isDone(c), dueToday: occurrence(c) !== null })),
  )

  /** Marks today's occurrence complete. Returns the new completion, or `null` for a duplicate/ineligible tap. */
  async function complete(choreId: ID): Promise<ChoreCompletion | null> {
    const chore = chores.value.find((c) => c.id === choreId)
    if (!chore || pending.value.has(choreId)) return null
    const occ = occurrence(chore)
    if (!occ || isDone(chore)) return null
    pending.value.add(choreId)
    try {
      const svc = getServices()
      const { completion, created } = await svc.chores.recordCompletion(choreId, chore.assigneeId, svc.now(), occ)
      completions.value = await svc.chores.listCompletions()
      return created ? completion : null
    } finally {
      pending.value.delete(choreId)
    }
  }

  async function save(input: Omit<Chore, 'id'> & { id?: ID }): Promise<Chore> {
    const repo = getServices().chores
    const { id, ...rest } = input
    const saved = id ? await repo.updateChore(id, rest) : await repo.createChore(rest)
    chores.value = await repo.listChores()
    return saved
  }

  async function remove(id: ID) {
    await getServices().chores.deleteChore(id)
    chores.value = await getServices().chores.listChores()
  }

  const scope = computed(() => family.selectedId ?? undefined)
  const total = computed(() => totalPoints(completions.value, scope.value))
  const weekly = computed(() => weeklyPoints(completions.value, clock.weekStart, scope.value))
  const level = computed(() => levelFor(total.value))
  const streak = computed(() => streakDays(completions.value, clock.today, scope.value))
  const weekCompletions = computed(() => completionsInWeek(completions.value, clock.weekStart, scope.value))

  /** Newest first, within the member filter. */
  const history = computed(() =>
    uniqueCompletions(completions.value)
      .filter((c) => !scope.value || c.memberId === scope.value)
      .slice()
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
  )

  const badges = computed(() => achievements.value.filter((a) => !scope.value || a.memberId === scope.value))

  /** Family-wide goal progress (always the whole household). */
  const familyGoal = computed(() => ({
    target: FAMILY_WEEKLY_GOAL,
    done: completionsInWeek(completions.value, clock.weekStart).length,
  }))

  /** Per-member snapshot for the Chores modal's leaderboard-free progress cards. */
  function memberStats(memberId: ID) {
    const total = totalPoints(completions.value, memberId)
    return {
      total,
      weekly: weeklyPoints(completions.value, clock.weekStart, memberId),
      level: levelFor(total),
      streak: streakDays(completions.value, clock.today, memberId),
    }
  }

  return {
    chores, completions, achievements, pending, todayISO,
    load, occurrence, isDone, visible, dueTodayAll, openCount, defined, complete, save, remove,
    total, weekly, level, streak, weekCompletions, history, badges, familyGoal, memberStats,
  }
})
