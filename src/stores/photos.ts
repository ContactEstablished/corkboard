import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ID, Photo, PhotoCategory, PhotoFilter } from '@/models'
import { getServices } from '@/services/container'
import { useFamilyStore } from './family'

export const PHOTO_CATEGORIES: { value: PhotoCategory; label: string }[] = [
  { value: 'sports', label: 'Sports' },
  { value: 'school', label: 'School' },
  { value: 'trips', label: 'Trips' },
  { value: 'family', label: 'Family' },
  { value: 'pets', label: 'Pets' },
]

export const usePhotoStore = defineStore('photos', () => {
  const family = useFamilyStore()
  const all = ref<Photo[]>([])
  /** Selected album. Lives here so voice ("Open Liam's soccer photos") can set it. */
  const filter = ref<PhotoFilter>('all')

  async function load() {
    all.value = await getServices().photos.listPhotos()
  }

  /** Newest first, within the member filter. */
  const visible = computed(() =>
    all.value
      .filter((p) => !family.selectedId || p.memberIds.includes(family.selectedId))
      .slice()
      .sort((a, b) => b.takenAt.localeCompare(a.takenAt)),
  )

  async function toggleFavorite(id: ID) {
    const p = all.value.find((x) => x.id === id)
    if (!p) return
    const next = !p.favorite
    p.favorite = next
    try {
      await getServices().photos.setFavorite(id, next)
    } catch {
      p.favorite = !next
    }
  }

  async function setCaption(id: ID, caption: string) {
    const p = all.value.find((x) => x.id === id)
    if (!p) return
    const before = p.caption
    p.caption = caption
    try {
      await getServices().photos.setCaption(id, caption)
    } catch {
      p.caption = before
    }
  }

  return { all, filter, visible, load, toggleFavorite, setCaption }
})
