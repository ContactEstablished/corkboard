import { useRoute } from 'vue-router'
import type { AppFeature, VoiceOrigin } from '@/models'
import { useCalendarStore } from '@/stores/calendar'
import { useClockStore } from '@/stores/clock'
import { useFamilyStore } from '@/stores/family'
import { useVoiceStore } from '@/stores/voice'
import { toISODate } from '@/utils/date'
import { type ContextOverride, resolveVoiceContext } from './context'

/**
 * Single entry point for every microphone in the app. The global mic calls
 * `launch()`; a local mic calls `launch({ feature: 'groceries', … }, 'local-mic')`.
 * Both feed the same Voice Interaction Modal and the same pipeline.
 */
export function useVoiceLauncher() {
  const route = useRoute()
  const family = useFamilyStore()
  const calendar = useCalendarStore()
  const clock = useClockStore()
  const voice = useVoiceStore()

  function launch(override: ContextOverride = {}, origin: VoiceOrigin = 'global-mic') {
    const feature = (route.meta.feature as AppFeature | undefined) ?? 'home'
    const ctx = resolveVoiceContext(
      {
        route: route.path,
        feature,
        calendarView: feature === 'calendar' ? calendar.view : undefined,
        selectedDate: toISODate(clock.today),
        memberId: family.selectedId,
      },
      origin,
      override,
    )
    return voice.open(ctx)
  }

  return { launch }
}
