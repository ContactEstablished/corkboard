import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getServices } from '@/services/container'
import { addDays, startOfDay, startOfWeek } from '@/utils/date'

/** One shared ticking clock for the whole UI. */
export const useClockStore = defineStore('clock', () => {
  const now = ref(new Date())
  let timer: ReturnType<typeof setInterval> | undefined

  const today = computed(() => startOfDay(now.value))
  const tomorrow = computed(() => addDays(today.value, 1))
  const weekStart = computed(() => startOfWeek(now.value))

  function start() {
    stop()
    now.value = getServices().now()
    timer = setInterval(() => (now.value = getServices().now()), 1000)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = undefined
  }

  return { now, today, tomorrow, weekStart, start, stop }
})
