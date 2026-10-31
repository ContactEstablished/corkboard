<script setup lang="ts">
import { ChevronLeft, ChevronRight, Heart, Mic, Pause, Play } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import MemberAvatar from '@/components/hud/MemberAvatar.vue'
import type { Photo } from '@/models'
import { useFamilyStore } from '@/stores/family'
import { useVoiceLauncher } from '@/features/voice/useVoiceLauncher'
import { usePhotoStore } from '@/stores/photos'

const props = withDefaults(defineProps<{ photos: Photo[]; autoplay?: boolean; intervalMs?: number }>(), { intervalMs: 5000 })
const index = defineModel<number>('index', { required: true })

const family = useFamilyStore()
const store = usePhotoStore()
const { launch } = useVoiceLauncher()

const photo = computed(() => props.photos[index.value] ?? null)
const people = computed(() => (photo.value?.memberIds ?? []).map((id) => family.byId.get(id)).filter((m) => !!m))
const dateLabel = computed(() => (photo.value ? new Date(photo.value.takenAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''))

function go(delta: number) {
  const n = props.photos.length
  if (n) index.value = (index.value + delta + n) % n
}

// Slideshow timer (respects the play/pause control).
const playing = ref(!!props.autoplay)
let timer: ReturnType<typeof setInterval> | undefined
watch(
  [playing, () => props.photos.length],
  () => {
    if (timer) clearInterval(timer)
    timer = playing.value && props.photos.length > 1 ? setInterval(() => go(1), props.intervalMs) : undefined
  },
  { immediate: true },
)
onBeforeUnmount(() => timer && clearInterval(timer))

/** Dictate a caption for this photo. Pauses the slideshow so the photo can't change underneath. */
function sayCaption() {
  const target = photo.value
  if (!target) return
  playing.value = false
  void launch(
    { feature: 'photos', activeModal: 'photo-viewer', operation: 'edit', entityId: target.id, field: 'photo.caption' },
    'local-mic',
    { onDictation: (t) => store.setCaption(target.id, t) },
  )
}

// Keep the index valid if the list shrinks (e.g. the member filter changes).
watch(
  () => props.photos.length,
  (n) => {
    if (index.value >= n) index.value = Math.max(0, n - 1)
  },
)
</script>

<template>
  <div v-if="photo" class="stage" data-testid="photo-stage">
    <div class="stage__frame">
      <button type="button" class="stage__nav stage__nav--prev" aria-label="Previous photo" @click="go(-1)"><ChevronLeft /></button>
      <img :key="photo.id" :src="photo.url" :alt="photo.caption ?? 'Family photo'" class="stage__img" />
      <button type="button" class="stage__nav stage__nav--next" aria-label="Next photo" @click="go(1)"><ChevronRight /></button>
    </div>
    <div class="stage__bar">
      <div class="stage__info">
        <b data-testid="photo-caption">{{ photo.caption || 'Untitled' }}</b>
        <span>{{ dateLabel }} · {{ index + 1 }} of {{ photos.length }}</span>
      </div>
      <div class="stage__people" aria-label="People in this photo">
        <MemberAvatar v-for="m in people" :key="m!.id" :member="m!" size="2rem" />
      </div>
      <button type="button" class="stage__btn" aria-label="Say a caption" data-testid="say-caption" @click="sayCaption"><Mic /></button>
      <button type="button" class="stage__btn" :aria-label="playing ? 'Pause slideshow' : 'Play slideshow'" @click="playing = !playing">
        <component :is="playing ? Pause : Play" />
      </button>
      <button type="button" class="stage__btn stage__btn--fav" :class="{ 'stage__btn--on': photo.favorite }" :aria-pressed="photo.favorite" :aria-label="photo.favorite ? 'Remove from favorites' : 'Add to favorites'" @click="store.toggleFavorite(photo.id)">
        <Heart />
      </button>
    </div>
  </div>
  <div v-else class="stage stage--empty">No photos to show.</div>
</template>

<style scoped lang="scss">
.stage {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  min-height: 0;
  height: 100%;
  &--empty {
    align-items: center;
    justify-content: center;
    color: var(--hud-text-dim);
  }
}
.stage__frame {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--hud-border);
  border-radius: 0.8rem;
  background: var(--hud-bg-deep);
  overflow: hidden;
}
.stage__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  animation: fade 0.35s ease;
}
@keyframes fade {
  from { opacity: 0; }
}
.stage__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  display: grid;
  place-items: center;
  width: 3.6rem;
  height: 3.6rem;
  border: 1px solid var(--hud-border-bright);
  border-radius: 50%;
  background: color-mix(in srgb, var(--hud-bg-deep) 75%, transparent);
  color: var(--hud-primary);
  cursor: pointer;
  &--prev { left: 0.8rem; }
  &--next { right: 0.8rem; }
  svg {
    width: 1.8rem;
    height: 1.8rem;
  }
}
.stage__bar {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}
.stage__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  b {
    font-size: 1.15rem;
  }
  span {
    font-size: 0.8rem;
    color: var(--hud-text-dim);
  }
}
.stage__people {
  display: flex;
  gap: 0.3rem;
}
.stage__btn {
  display: grid;
  place-items: center;
  width: var(--hud-touch-min);
  height: var(--hud-touch-min);
  border: 1px solid var(--hud-border-bright);
  border-radius: 50%;
  background: none;
  color: var(--hud-primary);
  cursor: pointer;
  svg {
    width: 1.4rem;
    height: 1.4rem;
  }
  &--on {
    color: var(--hud-danger);
    border-color: var(--hud-danger);
    svg {
      fill: var(--hud-danger);
    }
  }
}
</style>
