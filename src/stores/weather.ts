import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { WeatherSnapshot } from '@/models'
import { getServices } from '@/services/container'

export const useWeatherStore = defineStore('weather', () => {
  const snapshot = ref<WeatherSnapshot | null>(null)
  const failed = ref(false)

  /** Keeps the last good snapshot if a refresh fails (offline-friendly). */
  async function load() {
    try {
      snapshot.value = await getServices().weather.current()
      failed.value = false
    } catch {
      failed.value = true
    }
  }

  return { snapshot, failed, load }
})
