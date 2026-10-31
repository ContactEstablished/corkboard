import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { GroceryCategory, ID, ShoppingItem } from '@/models'
import { getServices } from '@/services/container'

export const useGroceryStore = defineStore('groceries', () => {
  const items = ref<ShoppingItem[]>([])
  const suggestions = ref<string[]>([])

  async function load() {
    const repo = getServices().groceries
    ;[items.value, suggestions.value] = await Promise.all([repo.listItems(), repo.suggestions()])
  }

  const open = computed(() => items.value.filter((i) => !i.purchased))
  const purchased = computed(() => items.value.filter((i) => i.purchased))

  /** Open items per category, for the modal's filter list. */
  const counts = computed(() => {
    const out: Partial<Record<GroceryCategory, number>> = {}
    for (const i of open.value) out[i.category] = (out[i.category] ?? 0) + 1
    return out
  })

  /** Touch toggle for "purchased". Optimistic, rolled back if the save fails. */
  async function togglePurchased(id: ID) {
    const item = items.value.find((i) => i.id === id)
    if (!item) return
    const next = !item.purchased
    item.purchased = next
    try {
      await getServices().groceries.updateItem(id, { purchased: next })
    } catch {
      item.purchased = !next
    }
  }

  async function add(names: string[], memberId?: ID) {
    const created = await getServices().groceries.addItems(
      names.map((name) => ({ name })),
      memberId,
    )
    await load()
    return created
  }

  async function update(id: ID, patch: Partial<Omit<ShoppingItem, 'id'>>) {
    await getServices().groceries.updateItem(id, patch)
    await load()
  }

  async function remove(id: ID) {
    await getServices().groceries.removeItem(id)
    await load()
  }

  async function clearPurchased() {
    const done = purchased.value.slice()
    await Promise.all(done.map((i) => getServices().groceries.removeItem(i.id)))
    await load()
    return done.length
  }

  return { items, suggestions, open, purchased, counts, load, togglePurchased, add, update, remove, clearPurchased }
})
