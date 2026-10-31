import type { ChoreCompletion, ID } from '@/models'

/**
 * Scoring is a pure function of completion records. There is no stored
 * "score": totals are always re-derived, and records are de-duplicated by
 * `occurrenceKey`, so a double tap or repeated voice command can never
 * award points twice.
 */

/** Family-wide goal: completed chores per week. */
export const FAMILY_WEEKLY_GOAL = 25
/** Per-member weekly point target that fills the progress ring (demo config). */
export const WEEKLY_POINT_TARGET = 100

export function uniqueCompletions(completions: ChoreCompletion[]): ChoreCompletion[] {
  const seen = new Set<string>()
  return completions.filter((c) => (seen.has(c.occurrenceKey) ? false : (seen.add(c.occurrenceKey), true)))
}

export function totalPoints(completions: ChoreCompletion[], memberId?: ID): number {
  return uniqueCompletions(completions)
    .filter((c) => !memberId || c.memberId === memberId)
    .reduce((sum, c) => sum + c.pointsAwarded, 0)
}

/** Completions in [weekStart, weekStart + 7 days). */
export function completionsInWeek(completions: ChoreCompletion[], weekStart: Date, memberId?: ID): ChoreCompletion[] {
  const from = weekStart.getTime()
  const to = from + 7 * 86_400_000
  return uniqueCompletions(completions).filter((c) => {
    const t = new Date(c.completedAt).getTime()
    return t >= from && t < to && (!memberId || c.memberId === memberId)
  })
}

export function weeklyPoints(completions: ChoreCompletion[], weekStart: Date, memberId?: ID): number {
  return completionsInWeek(completions, weekStart, memberId).reduce((s, c) => s + c.pointsAwarded, 0)
}

/** Lower bound (points) of each level; level 1 starts at 0. */
const LEVEL_FLOORS = [0, 50, 120, 200, 300, 500, 750, 1050, 1400, 1800]

export interface LevelInfo {
  level: number
  /** Points earned within the current level. */
  into: number
  /** Points needed to span the current level (0 at max level). */
  span: number
  nextFloor: number | null
  /** 0–1 progress toward the next level. */
  progress: number
}

export function levelFor(points: number): LevelInfo {
  let idx = 0
  for (let i = 0; i < LEVEL_FLOORS.length; i++) if (points >= LEVEL_FLOORS[i]!) idx = i
  const floor = LEVEL_FLOORS[idx]!
  const next = LEVEL_FLOORS[idx + 1] ?? null
  return {
    level: idx + 1,
    into: points - floor,
    span: next === null ? 0 : next - floor,
    nextFloor: next,
    progress: next === null ? 1 : (points - floor) / (next - floor),
  }
}

/**
 * Consecutive days (ending today, or yesterday if nothing is done yet today)
 * on which the member completed at least one chore.
 */
export function streakDays(completions: ChoreCompletion[], today: Date, memberId?: ID): number {
  const days = new Set(
    uniqueCompletions(completions)
      .filter((c) => !memberId || c.memberId === memberId)
      .map((c) => dayKey(new Date(c.completedAt))),
  )
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let n = 0
  while (days.has(dayKey(cursor))) {
    n++
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
