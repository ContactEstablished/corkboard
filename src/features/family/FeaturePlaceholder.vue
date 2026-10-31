<script setup lang="ts">
import { CalendarDays, Hammer, Image, ListChecks, MessageSquare, Settings, ShoppingCart } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import HudPanel from '@/components/hud/HudPanel.vue'
import LocalMic from '@/components/voice/LocalMic.vue'
import type { AppFeature } from '@/models'
import { useCalendarStore } from '@/stores/calendar'
import { useChoreStore } from '@/stores/chores'
import { useGroceryStore } from '@/stores/groceries'
import { useMessageStore } from '@/stores/messages'

/**
 * Phase 1 stand-in for screens built in Phase 2. It proves navigation, route
 * metadata and that a local mic inherits this screen's voice context.
 */
const route = useRoute()
const feature = computed(() => route.meta.feature as AppFeature)
const calendar = useCalendarStore()
const chores = useChoreStore()
const groceries = useGroceryStore()
const messages = useMessageStore()

const ICONS = { calendar: CalendarDays, chores: ListChecks, groceries: ShoppingCart, messages: MessageSquare, photos: Image, settings: Settings, home: Hammer }
const summary = computed(() => {
  switch (feature.value) {
    case 'calendar': return `${calendar.visible.length} upcoming events loaded`
    case 'chores': return `${chores.visible.length} chores · ${chores.openCount} still to do`
    case 'groceries': return `${groceries.open.length} items on the list`
    case 'messages': return `${messages.feed.length} messages & reminders`
    default: return ''
  }
})
</script>

<template>
  <HudPanel :title="String(route.meta.title)" :icon="ICONS[feature]" class="ph" variant="primary">
    <div class="ph__body" data-testid="placeholder">
      <Hammer class="ph__hammer" aria-hidden="true" />
      <h3>{{ route.meta.title }} arrives in Phase 2</h3>
      <p>The full {{ String(route.meta.title).toLowerCase() }} experience is next on the roadmap. The shell, filters and voice are already wired in.</p>
      <p v-if="summary" class="ph__summary">{{ summary }}</p>
      <LocalMic
        v-if="['calendar', 'chores', 'groceries', 'messages'].includes(feature)"
        label="Voice for this screen"
        :context="{ feature, activeModal: `${feature}-screen` }"
      />
    </div>
  </HudPanel>
</template>

<style scoped lang="scss">
.ph__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  text-align: center;
  h3 {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
  }
  p {
    margin: 0;
    max-width: 32rem;
    color: var(--hud-text-dim);
  }
}
.ph__hammer {
  width: 3rem;
  height: 3rem;
  color: var(--hud-primary);
}
.ph__summary {
  color: var(--hud-primary) !important;
  font-weight: 600;
}
</style>
