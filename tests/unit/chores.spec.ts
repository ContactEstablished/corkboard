import { beforeEach, describe, expect, it } from 'vitest'
import { useChoreStore } from '@/stores/chores'
import { useFamilyStore } from '@/stores/family'
import { setup } from './helpers'

describe('chore store', () => {
  beforeEach(async () => {
    await setup()
  })

  it('awards points once, even when tapped twice at the same time', async () => {
    const chores = useChoreStore()
    const before = chores.total
    const [first, second] = await Promise.all([chores.complete('c-trash'), chores.complete('c-trash')])
    expect([first, second].filter(Boolean)).toHaveLength(1)
    expect(chores.total).toBe(before + 20)
    expect(await chores.complete('c-trash')).toBeNull()
    expect(chores.total).toBe(before + 20)
  })

  it('updates weekly points and progress for the assignee', async () => {
    const chores = useChoreStore()
    const weekly = chores.weekly
    const open = chores.openCount
    await chores.complete('c-table')
    expect(chores.weekly).toBe(weekly + 10)
    expect(chores.openCount).toBe(open - 1)
  })

  it('scopes totals to the selected family member', () => {
    const family = useFamilyStore()
    const chores = useChoreStore()
    const all = chores.total
    family.select('liam')
    expect(chores.total).toBe(335) // 310 history + 25 for "Clean your room" done earlier today
    expect(chores.total).toBeLessThan(all)
    family.clear()
    expect(chores.total).toBe(all)
  })
})
