import { useCalendarStore } from './calendar'
import { useChoreStore } from './chores'
import { useClockStore } from './clock'
import { useFamilyStore } from './family'
import { useGroceryStore } from './groceries'
import { useMessageStore } from './messages'
import { usePhotoStore } from './photos'
import { useWeatherStore } from './weather'

/** Initial load of every store from its repository. Call after `setServices()`. */
export async function loadAllStores(): Promise<void> {
  useClockStore().start()
  await useFamilyStore().load()
  await Promise.all([
    useCalendarStore().load(true),
    useGroceryStore().load(),
    useChoreStore().load(),
    useMessageStore().load(),
    usePhotoStore().load(),
    useWeatherStore().load(),
  ])
}

/** Reload data that voice actions may have changed. */
export async function refreshAfterAction(): Promise<void> {
  await Promise.all([
    useCalendarStore().load(true),
    useGroceryStore().load(),
    useChoreStore().load(),
    useMessageStore().load(),
  ])
}
