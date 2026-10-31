<script setup lang="ts">
import { Clock, Heart, Image as ImageIcon, Images } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import FeatureModal from '@/components/hud/FeatureModal.vue'
import HudModal from '@/components/hud/HudModal.vue'
import HudSegmented from '@/components/hud/HudSegmented.vue'
import type { Photo, PhotoCategory } from '@/models'
import { useClockStore } from '@/stores/clock'
import { useFamilyStore } from '@/stores/family'
import { PHOTO_CATEGORIES, usePhotoStore } from '@/stores/photos'
import PhotoStage from './PhotoStage.vue'

const props = defineProps<{ open: boolean }>()
defineEmits<{ close: [] }>()

const photos = usePhotoStore()
const family = useFamilyStore()
const clock = useClockStore()

type Filter = 'all' | 'favorites' | 'recent' | PhotoCategory
const filter = ref<Filter>('all')
const mode = ref<'grid' | 'slideshow'>('grid')
const viewerIndex = ref<number | null>(null)
const slideIndex = ref(0)

const RECENT_DAYS = 14
const matches = (p: Photo, f: Filter) =>
  f === 'all' ? true
  : f === 'favorites' ? p.favorite
  : f === 'recent' ? new Date(p.takenAt).getTime() >= clock.now.getTime() - RECENT_DAYS * 86_400_000
  : p.category === f
const filtered = computed(() => photos.visible.filter((p) => matches(p, filter.value)))
const countFor = (f: Filter) => photos.visible.filter((p) => matches(p, f)).length
const FILTERS = computed<{ value: Filter; label: string; icon?: typeof Heart }[]>(() => [
  { value: 'all', label: 'All photos', icon: Images },
  { value: 'favorites', label: 'Favorites', icon: Heart },
  { value: 'recent', label: 'Recent', icon: Clock },
  ...PHOTO_CATEGORIES,
])
const title = computed(() => (family.selected ? `${family.selected.name}’s photos` : 'Family photos'))

// Changing the filter (or member) restarts from the first photo.
watch([filter, () => family.selectedId], () => {
  slideIndex.value = 0
  viewerIndex.value = null
})
watch(
  () => props.open,
  (o) => {
    if (!o) viewerIndex.value = null
  },
)
</script>

<template>
  <FeatureModal :open="open" :title="title" :icon="ImageIcon" @close="$emit('close')">
    <template #actions>
      <HudSegmented
        v-model="mode"
        label="View"
        :options="[
          { value: 'grid', label: 'Grid' },
          { value: 'slideshow', label: 'Slideshow' },
        ]"
      />
    </template>

    <div class="pm" data-testid="photos-modal">
      <nav class="pm__filters" aria-label="Albums">
        <button
          v-for="f in FILTERS"
          :key="f.value"
          type="button"
          class="pm__filter"
          :class="{ 'pm__filter--on': filter === f.value }"
          :aria-pressed="filter === f.value"
          @click="filter = f.value"
        >
          <component :is="f.icon" v-if="f.icon" aria-hidden="true" /><i v-else aria-hidden="true" /><span>{{ f.label }}</span><b>{{ countFor(f.value) }}</b>
        </button>
      </nav>

      <section class="pm__main">
        <template v-if="filtered.length">
          <ul v-if="mode === 'grid'" class="pm__grid" data-testid="photo-grid">
            <li v-for="(p, i) in filtered" :key="p.id">
              <button type="button" class="pm__thumb" :aria-label="`Open ${p.caption ?? 'photo'}`" @click="viewerIndex = i">
                <img :src="p.url" :alt="p.caption ?? 'Family photo'" loading="lazy" />
                <span class="pm__cap">{{ p.caption }}</span>
                <Heart v-if="p.favorite" class="pm__fav" aria-label="Favorite" />
              </button>
            </li>
          </ul>
          <PhotoStage v-else v-model:index="slideIndex" :photos="filtered" autoplay />
        </template>
        <div v-else class="pm__empty" data-testid="photos-empty">
          <ImageIcon aria-hidden="true" />
          <strong>No photos here yet</strong>
          <span>{{ family.selected ? `${family.selected.name} has no photos in this album.` : 'Add photos from the family devices.' }}</span>
        </div>
      </section>
    </div>

    <HudModal :open="viewerIndex !== null" :title="filtered[viewerIndex ?? 0]?.caption ?? 'Photo'" size="lg" layer="top" @close="viewerIndex = null">
      <div class="pm__viewer">
        <PhotoStage v-if="viewerIndex !== null" v-model:index="viewerIndex" :photos="filtered" />
      </div>
    </HudModal>
  </FeatureModal>
</template>

<style scoped lang="scss">
.pm {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 13rem minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 1.1rem;
}
.pm__filters {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  overflow-y: auto;
}
.pm__filter {
  display: grid;
  grid-template-columns: 1.5rem 1fr auto;
  align-items: center;
  gap: 0.6rem;
  min-height: var(--hud-touch-min);
  padding: 0 0.8rem;
  border: 1px solid transparent;
  border-radius: 0.8rem;
  background: none;
  text-align: left;
  color: var(--hud-text-dim);
  font-size: 0.98rem;
  cursor: pointer;
  svg {
    width: 1.3rem;
    height: 1.3rem;
  }
  i {
    width: 0.5rem;
    height: 0.5rem;
    margin-left: 0.4rem;
    border-radius: 50%;
    background: var(--hud-border-bright);
  }
  b {
    font-size: 0.82rem;
    color: var(--hud-primary);
  }
  &--on {
    color: var(--hud-text);
    border-color: var(--hud-primary);
    background: linear-gradient(180deg, color-mix(in srgb, var(--hud-blue) 40%, transparent), color-mix(in srgb, var(--hud-blue-deep) 35%, transparent));
  }
}
.pm__main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.pm__grid {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0 0.3rem 0 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
  grid-auto-rows: 8.2rem;
  gap: 0.7rem;
  overflow-y: auto;
}
.pm__thumb {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 1px solid var(--hud-border);
  border-radius: 0.7rem;
  background: var(--hud-bg-deep);
  overflow: hidden;
  cursor: pointer;
  &:active {
    transform: scale(0.98);
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
.pm__cap {
  position: absolute;
  inset: auto 0 0 0;
  padding: 1.2rem 0.6rem 0.4rem;
  background: linear-gradient(transparent, color-mix(in srgb, var(--hud-bg-deep) 85%, transparent));
  text-align: left;
  font-size: 0.8rem;
  color: var(--hud-text);
}
.pm__fav {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  width: 1.3rem;
  height: 1.3rem;
  color: var(--hud-danger);
  fill: var(--hud-danger);
}
.pm__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--hud-text-dim);
  > svg {
    width: 3.5rem;
    height: 3.5rem;
    color: var(--hud-primary);
  }
  strong {
    font-size: 1.25rem;
    color: var(--hud-text);
  }
}
.pm__viewer {
  height: 60vh;
}
</style>
