<script setup lang="ts">
import { CalendarClock, MapPin, Pencil, Repeat, Users } from 'lucide-vue-next'
import { computed } from 'vue'
import ConfirmButton from '@/components/hud/ConfirmButton.vue'
import HudButton from '@/components/hud/HudButton.vue'
import HudModal from '@/components/hud/HudModal.vue'
import MicButton from '@/components/voice/MicButton.vue'
import { useVoiceLauncher } from '@/features/voice/useVoiceLauncher'
import { useVoiceStore } from '@/stores/voice'
import MemberAvatar from '@/components/hud/MemberAvatar.vue'
import type { CalendarEvent } from '@/models'
import { useCalendarStore } from '@/stores/calendar'
import { useFamilyStore } from '@/stores/family'
import { formatTime } from '@/utils/date'
import { eventAccent, isWholeFamily } from './layout'
import { describeRecurrence } from './recurrence'

const props = defineProps<{ event: CalendarEvent | null }>()
const emit = defineEmits<{ close: []; edit: [event: CalendarEvent] }>()

const calendar = useCalendarStore()
const voice = useVoiceStore()
const { launch } = useVoiceLauncher()

/** "Move it to 5 PM" / "Cancel it": the event's id travels in the voice context, so "it" is unambiguous. */
function speak() {
  if (!props.event) return
  const entityId = props.event.id
  emit('close')
  void launch({ feature: 'calendar', activeModal: 'event-detail', operation: 'edit', entityId }, 'local-mic')
}
const family = useFamilyStore()

const e = computed(() => props.event)
const people = computed(() => (e.value?.memberIds ?? []).map((id) => family.byId.get(id)).filter((m) => !!m))
const when = computed(() => {
  if (!e.value) return ''
  const s = new Date(e.value.start)
  const day = s.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  return e.value.allDay ? `${day} · All day` : `${day} · ${formatTime(s)} – ${formatTime(new Date(e.value.end))}`
})
const accent = computed(() => (e.value ? eventAccent(e.value, family.byId) : 'var(--hud-primary)'))
const repeats = computed(() => (e.value?.recurrence ? describeRecurrence(e.value.recurrence) : ''))

async function remove() {
  if (!e.value) return
  await calendar.remove(e.value.seriesId ?? e.value.id)
  emit('close')
}
</script>

<template>
  <HudModal :open="!!event" :title="event?.title ?? ''" size="md" layer="top" @close="emit('close')">
    <div v-if="event" class="ed" :style="{ '--accent': accent }" data-testid="event-detail">
      <p class="ed__row"><CalendarClock aria-hidden="true" />{{ when }}</p>
      <p class="ed__row">
        <Users aria-hidden="true" />
        <template v-if="isWholeFamily(event)">Whole family</template>
        <span v-else class="ed__people"><span v-for="m in people" :key="m!.id" class="ed__person"><MemberAvatar :member="m!" size="1.9rem" />{{ m!.name }}</span></span>
      </p>
      <p v-if="event.location" class="ed__row"><MapPin aria-hidden="true" />{{ event.location }}</p>
      <p v-if="repeats" class="ed__row"><Repeat aria-hidden="true" />Repeats: {{ repeats }}</p>

      <footer class="ed__foot">
        <ConfirmButton
          label="Delete"
          :confirm-label="event.seriesId ? 'Yes, delete all' : 'Yes, delete'"
          :prompt="event.seriesId ? 'Delete every repeat?' : 'Delete this event?'"
          @confirm="remove"
        />
        <span class="ed__spacer" />
        <MicButton size="sm" :state="voice.micVisual" label="Change or cancel by voice" data-testid="event-voice" @press="speak" />
        <HudButton variant="primary" data-testid="event-edit" @click="emit('edit', event)">
          <template #icon><Pencil /></template>
          Edit
        </HudButton>
      </footer>
    </div>
  </HudModal>
</template>

<style scoped lang="scss">
.ed {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding-left: 0.9rem;
  border-left: 0.3rem solid var(--accent);
}
.ed__row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin: 0;
  font-size: 1.1rem;
  svg {
    width: 1.3rem;
    height: 1.3rem;
    flex: none;
    color: var(--accent);
  }
}
.ed__people {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}
.ed__person {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.ed__foot {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--hud-border);
}
.ed__spacer {
  flex: 1;
}
</style>
