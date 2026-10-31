import type { Router } from 'vue-router'
import type { NavigationService } from '@/services/interfaces'
import { useCalendarStore } from '@/stores/calendar'
import { useFamilyStore } from '@/stores/family'
import { usePhotoStore } from '@/stores/photos'
import { parseISODate } from '@/utils/date'

/**
 * Router-backed implementation of `NavigationService`: the only place a voice
 * "show me…" command is translated into app state (member filter, calendar
 * range, photo album) and a route change.
 */
export function createAppNavigator(router: Router): NavigationService {
  return {
    async go(target) {
      const family = useFamilyStore()
      if (target.memberId === null) family.clear()
      else if (target.memberId) family.select(target.memberId)

      if (target.route === '/calendar') {
        const calendar = useCalendarStore()
        if (target.calendarView) calendar.view = target.calendarView
        if (target.date) calendar.select(parseISODate(target.date))
      }
      if (target.route === '/photos') usePhotoStore().filter = target.photoFilter ?? 'all'

      await router.push(target.route)
    },
  }
}
