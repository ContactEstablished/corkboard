<script setup lang="ts">
import { House, Settings, Wifi, WifiOff } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HudIconButton from '@/components/hud/HudIconButton.vue'
import MemberAvatar from '@/components/hud/MemberAvatar.vue'
import HudSegmented from '@/components/hud/HudSegmented.vue'
import MicButton from '@/components/voice/MicButton.vue'
import WeatherCompact from '@/features/weather/WeatherCompact.vue'
import { useOnline } from '@/features/family/useOnline'
import { useVoiceLauncher } from '@/features/voice/useVoiceLauncher'
import type { CalendarViewMode } from '@/models'
import { useCalendarStore } from '@/stores/calendar'
import { useClockStore } from '@/stores/clock'
import { useFamilyStore } from '@/stores/family'
import { useVoiceStore } from '@/stores/voice'
import { clockParts, formatLongDate } from '@/utils/date'

const family = useFamilyStore()
const clock = useClockStore()
const voice = useVoiceStore()
const calendar = useCalendarStore()
const route = useRoute()
const router = useRouter()
const { launch } = useVoiceLauncher()
const online = useOnline()

const parts = computed(() => clockParts(clock.now))
const date = computed(() => formatLongDate(clock.now))
const showViewTabs = computed(() => route.meta.feature === 'calendar')
const viewOptions: { value: CalendarViewMode; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]
</script>

<template>
  <header class="hdr">
    <button type="button" class="hdr__brand" aria-label="Family Hub home" @click="router.push('/')">
      <House class="hdr__logo" aria-hidden="true" />
      <span class="hdr__name hud-display">Family Hub</span>
    </button>
    <p class="hdr__tag hud-display" aria-hidden="true">Smart Home <i /> Family Life <i /> All in one place</p>

    <HudSegmented v-if="showViewTabs" v-model="calendar.view" class="hdr__views" label="Calendar view" :options="viewOptions" />

    <div class="hdr__right">
      <span class="hdr__net" :class="{ 'hdr__net--off': !online }" :title="online ? 'Online' : 'Offline'" role="img" :aria-label="online ? 'Online' : 'Offline'">
        <component :is="online ? Wifi : WifiOff" />
      </span>
      <WeatherCompact />
      <div class="hdr__time" aria-live="off">
        <span class="hdr__clock">{{ parts.time }} <small>{{ parts.meridiem }}</small></span>
        <span class="hdr__date">{{ date }}</span>
      </div>

      <nav class="hdr__people" aria-label="Family members">
        <MemberAvatar :member="null" size="2.4rem" show-name interactive :selected="!family.selectedId" :dimmed="!!family.selectedId" @select="family.clear()" />
        <MemberAvatar
          v-for="m in family.members"
          :key="m.id"
          :member="m"
          size="2.4rem"
          show-name
          interactive
          :selected="family.selectedId === m.id"
          :dimmed="!!family.selectedId && family.selectedId !== m.id"
          @select="family.select(m.id)"
        />
      </nav>

      <HudIconButton label="Settings" :active="route.meta.feature === 'settings'" @click="router.push('/settings')"><Settings /></HudIconButton>
      <MicButton :state="voice.micVisual" label="Voice assistant" data-testid="global-mic" @press="launch()" />
    </div>
  </header>
</template>

<style scoped lang="scss">
.hdr {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.55rem 1.4rem 0.55rem 1rem;
  height: var(--hud-header-h);
  // lit underline with a bright segment, in lieu of a heavy bar
  border-bottom: 1px solid var(--hud-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--hud-surface) 45%, transparent), transparent);
  &::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: -1px;
    width: 22%;
    height: 2px;
    background: linear-gradient(90deg, var(--hud-primary), transparent);
    box-shadow: 0 0 0.6rem var(--hud-glow);
  }
}

.hdr__brand {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-height: var(--hud-touch-min);
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}
.hdr__logo {
  width: 2.1rem;
  height: 2.1rem;
  color: var(--hud-primary);
  filter: drop-shadow(0 0 0.4rem var(--hud-glow));
}
.hdr__name {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--hud-text);
  text-shadow: 0 0 0.9rem color-mix(in srgb, var(--hud-glow) 55%, transparent);
  white-space: nowrap;
}
.hdr__tag {
  display: none;
  align-items: center;
  gap: 0.6rem;
  margin: 0;
  padding-left: 1.2rem;
  border-left: 1px solid var(--hud-border);
  font-size: 0.62rem;
  letter-spacing: 0.28em;
  color: var(--hud-primary);
  white-space: nowrap;
  i {
    width: 0.25rem;
    height: 0.25rem;
    border-radius: 50%;
    background: var(--hud-primary);
  }
  @media (min-width: 1500px) {
    display: flex;
  }
}
.hdr__views {
  margin-left: 0.4rem;
}

.hdr__right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
}
.hdr__net {
  display: grid;
  place-items: center;
  color: var(--hud-primary);
  svg {
    width: 1.4rem;
    height: 1.4rem;
  }
  &--off {
    color: var(--hud-warning);
  }
}
.hdr__time {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.1;
  white-space: nowrap;
}
.hdr__clock {
  font-size: 1.5rem;
  font-weight: 600;
  small {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--hud-text-dim);
  }
}
.hdr__date {
  font-size: 0.78rem;
  color: var(--hud-text-dim);
}
.hdr__people {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
}
</style>
