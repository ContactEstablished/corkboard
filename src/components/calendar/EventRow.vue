<script setup lang="ts">
import { Users } from 'lucide-vue-next'
import { computed } from 'vue'
import MemberAvatar from '@/components/hud/MemberAvatar.vue'
import type { CalendarEvent } from '@/models'
import { useFamilyStore } from '@/stores/family'
import { formatTime } from '@/utils/date'
import { eventIcon } from './eventIcon'

const props = defineProps<{ event: CalendarEvent; past?: boolean; next?: boolean }>()
const family = useFamilyStore()

const people = computed(() => props.event.memberIds.map((id) => family.byId.get(id)).filter((m) => !!m))
const wholeFamily = computed(() => people.value.length === 0 || people.value.length >= 4)
const accent = computed(() => (!wholeFamily.value && people.value[0] ? `var(--hud-accent-${people.value[0].accent})` : 'var(--hud-primary)'))
const start = computed(() => new Date(props.event.start))
const timeLabel = computed(() => (props.event.allDay ? 'All day' : formatTime(start.value)))
const range = computed(() => (props.event.allDay ? props.event.location ?? '' : `${formatTime(start.value)} – ${formatTime(new Date(props.event.end))}`))
const who = computed(() => (wholeFamily.value ? 'Family' : people.value.map((p) => p!.name).join(', ')))
const icon = computed(() => eventIcon(props.event))
</script>

<template>
  <div class="ev" :class="{ 'ev--past': past, 'ev--next': next }" :style="{ '--accent': accent }">
    <span class="ev__time">{{ timeLabel }}<em v-if="next" class="ev__tag">Next</em></span>
    <div class="ev__card">
      <component :is="icon" class="ev__icon" aria-hidden="true" />
      <div class="ev__text">
        <span class="ev__title">{{ event.title }}</span>
        <span class="ev__meta">{{ range }}<template v-if="range && who"> · </template>{{ who }}</span>
      </div>
      <span class="ev__who" :title="who">
        <Users v-if="wholeFamily" class="ev__family" aria-label="Whole family" />
        <MemberAvatar v-else-if="people[0]" :member="people[0]" size="1.9rem" />
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ev {
  display: grid;
  grid-template-columns: 4.3rem minmax(0, 1fr);
  align-items: center;
  gap: 0.6rem;
  &--past {
    opacity: 0.5;
  }
}
.ev__time {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 0.85rem;
  color: var(--hud-text-dim);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
// Dark translucent card, subtle colored outline, no large flat color blocks.
.ev__card {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-height: 3.35rem;
  padding: 0.3rem 0.7rem 0.3rem 0.8rem;
  border: 1px solid color-mix(in srgb, var(--accent) 65%, transparent);
  border-left: 0.28rem solid var(--accent);
  border-radius: 0.7rem;
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 17%, var(--hud-panel)), color-mix(in srgb, var(--accent) 5%, var(--hud-panel)));
  .ev--next & {
    box-shadow: 0 0 0.9rem color-mix(in srgb, var(--accent) 38%, transparent);
  }
}
.ev__icon {
  width: 1.5rem;
  height: 1.5rem;
  flex: none;
  color: color-mix(in srgb, var(--accent) 70%, white);
}
.ev__text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.ev__title {
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ev__meta {
  font-size: 0.75rem;
  color: var(--hud-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ev__tag {
  margin-top: 0.1rem;
  padding: 0 0.45rem;
  border-radius: 999px;
  border: 1px solid var(--hud-primary);
  font-size: 0.62rem;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hud-primary);
  white-space: nowrap;
}
.ev__who {
  display: grid;
  place-items: center;
  flex: none;
}
.ev__family {
  width: 1.6rem;
  height: 1.6rem;
  color: var(--hud-text-dim);
}
</style>
