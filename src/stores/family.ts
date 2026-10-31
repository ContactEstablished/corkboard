import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { FamilyMember, ID } from '@/models'
import { getServices } from '@/services/container'

export const useFamilyStore = defineStore('family', () => {
  const members = ref<FamilyMember[]>([])
  /** Global member filter. `null` = Family / Everyone. Persists across navigation. */
  const selectedId = ref<ID | null>(null)

  const selected = computed(() => members.value.find((m) => m.id === selectedId.value) ?? null)
  const byId = computed(() => new Map(members.value.map((m) => [m.id, m])))

  async function load() {
    members.value = await getServices().family.listMembers()
    if (selectedId.value && !byId.value.has(selectedId.value)) selectedId.value = null
  }

  /** Tapping the already-selected member keeps them selected; use `clear()` to go back to Family. */
  function select(id: ID) {
    if (byId.value.has(id)) selectedId.value = id
  }

  function clear() {
    selectedId.value = null
  }

  function nameOf(id?: ID | 'family' | null): string {
    if (!id || id === 'family') return 'Family'
    return byId.value.get(id)?.name ?? 'Unknown'
  }

  /** Does `memberIds` (an event's/chore's people) belong in the current filter? Empty = whole family. */
  function matchesFilter(memberIds: ID[] | undefined): boolean {
    if (!selectedId.value) return true
    if (!memberIds || memberIds.length === 0) return true
    return memberIds.includes(selectedId.value)
  }

  return { members, selectedId, selected, byId, load, select, clear, nameOf, matchesFilter }
})
