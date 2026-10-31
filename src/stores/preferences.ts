import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const KEY = 'familyhub.prefs'

function load(): { speakReplies: boolean } {
  try {
    return { speakReplies: false, ...(JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as object) }
  } catch {
    return { speakReplies: false }
  }
}

/** Per-device UI preferences (kept in localStorage; never sent anywhere). */
export const usePreferencesStore = defineStore('preferences', () => {
  const initial = load()
  /** Read voice replies aloud. Off by default: the front-door screen shouldn't talk unprompted. */
  const speakReplies = ref(initial.speakReplies)

  watch(speakReplies, (v) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ speakReplies: v }))
    } catch {
      /* storage unavailable: the preference just won't persist */
    }
  })

  return { speakReplies }
})
