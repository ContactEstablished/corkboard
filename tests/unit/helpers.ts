import { createPinia, setActivePinia } from 'pinia'
import { type MockServiceOptions, createMockServices, setServices } from '@/services/container'
import { loadAllStores } from '@/stores/bootstrap'

/** Thursday, 29 Oct 2026, 9:00 AM local. */
export const NOW = new Date(2026, 9, 29, 9, 0, 0)

export const instantSpeech = { startDelayMs: 0, wordDelayMs: 0, finalDelayMs: 0 }

export async function setup(opts: MockServiceOptions = {}) {
  setActivePinia(createPinia())
  const services = createMockServices({ now: () => new Date(NOW), mockRecognizer: instantSpeech, ...opts })
  setServices(services)
  await loadAllStores()
  return services
}
