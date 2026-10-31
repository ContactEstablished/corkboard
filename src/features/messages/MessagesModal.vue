<script setup lang="ts">
import { Bell, Check, Lightbulb, Lock, MessageCircle, MessageSquare, StickyNote, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import ConfirmButton from '@/components/hud/ConfirmButton.vue'
import FeatureModal from '@/components/hud/FeatureModal.vue'
import MemberAvatar from '@/components/hud/MemberAvatar.vue'
import LocalMic from '@/components/voice/LocalMic.vue'
import { type FeedItem, useMessageStore } from '@/stores/messages'
import { useClockStore } from '@/stores/clock'
import { useFamilyStore } from '@/stores/family'
import { formatRelative, formatTime } from '@/utils/date'

defineProps<{ open: boolean }>()
defineEmits<{ close: [] }>()

const messages = useMessageStore()
const family = useFamilyStore()
const clock = useClockStore()

type Filter = 'all' | 'message' | 'reminder' | 'note'
const filter = ref<Filter>('all')
const FILTERS: { value: Filter; label: string; icon: typeof Bell }[] = [
  { value: 'all', label: 'All', icon: MessageCircle },
  { value: 'message', label: 'Messages', icon: MessageSquare },
  { value: 'reminder', label: 'Reminders', icon: Bell },
  { value: 'note', label: 'Notes', icon: StickyNote },
]
const groupOf = (m: FeedItem): Filter => (m.type === 'announcement' ? 'message' : m.type)
const countOf = (f: Filter) => messages.all.filter((m) => f === 'all' || groupOf(m) === f).length
const rows = computed(() => messages.all.filter((m) => filter.value === 'all' || groupOf(m) === filter.value))

const text = (m: FeedItem) => (messages.canReveal(m) ? m.text : 'Private message')
const toLabel = (m: FeedItem) => (m.recipientIds === 'everyone' ? 'Everyone' : m.recipientIds.map((id) => family.nameOf(id)).join(', '))
const typeLabel = (m: FeedItem) => ({ message: 'Message', announcement: 'Announcement', note: 'Note', reminder: 'Reminder' })[m.type]

function when(m: FeedItem): string {
  const at = new Date(m.at)
  if (m.type === 'reminder' && at > clock.now) {
    const sameDay = at.toDateString() === clock.now.toDateString()
    return `Due ${sameDay ? '' : at.toLocaleDateString('en-US', { weekday: 'short' }) + ' '}${formatTime(at)}`
  }
  return formatRelative(at, clock.now)
}
const emptyTitle = computed(() => (filter.value === 'all' ? 'No messages yet' : `No ${FILTERS.find((f) => f.value === filter.value)?.label.toLowerCase()} yet`))
</script>

<template>
  <FeatureModal :open="open" title="Messages & notes" :icon="MessageCircle" @close="$emit('close')">
    <div class="mm" data-testid="messages-modal">
      <nav class="mm__filters" aria-label="Filter">
        <button
          v-for="f in FILTERS"
          :key="f.value"
          type="button"
          class="mm__filter"
          :class="{ 'mm__filter--on': filter === f.value }"
          :aria-pressed="filter === f.value"
          @click="filter = f.value"
        >
          <component :is="f.icon" aria-hidden="true" /><span>{{ f.label }}</span><b>{{ countOf(f.value) }}</b>
        </button>
      </nav>

      <section class="mm__list" aria-label="Messages">
        <ul v-if="rows.length" class="mm__rows" data-testid="messages-modal-list">
          <li v-for="m in rows" :key="`${m.type}-${m.id}`" class="mm__row" :class="{ 'mm__row--done': m.done }">
            <span v-if="m.type === 'reminder'" class="mm__badge" aria-hidden="true"><Bell /></span>
            <span v-else-if="m.type === 'note'" class="mm__badge" aria-hidden="true"><StickyNote /></span>
            <MemberAvatar v-else :member="m.senderId === 'family' ? null : (family.byId.get(m.senderId) ?? null)" size="2.8rem" />

            <div class="mm__text">
              <div class="mm__top">
                <b>{{ m.type === 'reminder' ? 'Reminder' : family.nameOf(m.senderId) }}</b>
                <span v-if="m.type === 'announcement' || m.type === 'note'" class="mm__type">{{ typeLabel(m) }}</span>
                <span class="mm__to">To {{ toLabel(m) }}</span>
                <time>{{ when(m) }}</time>
              </div>
              <p class="mm__body" :class="{ 'mm__body--private': !messages.canReveal(m) }">
                <Lock v-if="!messages.canReveal(m)" aria-hidden="true" />{{ text(m) }}
              </p>
            </div>

            <button
              v-if="m.type === 'reminder'"
              type="button"
              class="mm__done"
              :class="{ 'mm__done--on': m.done }"
              :aria-pressed="!!m.done"
              :aria-label="m.done ? 'Mark reminder not done' : 'Mark reminder done'"
              @click="messages.setReminderDone(m.id, !m.done)"
            >
              <Check />
            </button>
            <ConfirmButton icon-only label="Delete message" confirm-label="Yes, delete" prompt="Delete?" @confirm="messages.remove(m)" />
          </li>
        </ul>
        <div v-else class="mm__empty" data-testid="messages-modal-empty">
          <MessageCircle aria-hidden="true" />
          <strong>{{ emptyTitle }}</strong>
          <span class="mm__tip"><Lightbulb aria-hidden="true" /> Try “Send everyone a message that dinner is at six”</span>
        </div>
      </section>

      <aside class="mm__side">
        <LocalMic label="Add message or note by voice" :context="{ feature: 'messages', activeModal: 'messages', operation: 'send' }" />
        <ul class="mm__examples" aria-label="Things you can say">
          <li>“Send everyone a message that dinner is at six”</li>
          <li>“Remind Liam to bring his soccer cleats tomorrow”</li>
          <li>“Add a note that library books are due Monday”</li>
        </ul>
      </aside>
    </div>
  </FeatureModal>
</template>

<style scoped lang="scss">
.mm {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 13rem minmax(0, 1fr) 12.5rem;
  grid-template-rows: minmax(0, 1fr);
  gap: 1.1rem;
}
.mm__filters {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.mm__filter {
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
.mm__list {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.3rem;
}
.mm__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
.mm__row {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  min-height: 4.6rem;
  padding: 0.4rem 0.2rem;
  border-bottom: 1px solid color-mix(in srgb, var(--hud-border) 55%, transparent);
  &--done {
    opacity: 0.5;
    .mm__body {
      text-decoration: line-through;
    }
  }
}
.mm__badge {
  display: grid;
  place-items: center;
  width: 2.8rem;
  height: 2.8rem;
  flex: none;
  border: 0.14rem solid var(--hud-primary);
  border-radius: 50%;
  color: var(--hud-primary);
  svg {
    width: 1.3rem;
    height: 1.3rem;
  }
}
.mm__text {
  flex: 1;
  min-width: 0;
}
.mm__top {
  display: flex;
  align-items: baseline;
  gap: 0.7rem;
  font-size: 0.9rem;
  time {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--hud-text-faint);
    white-space: nowrap;
  }
}
.mm__type {
  padding: 0 0.5rem;
  border: 1px solid var(--hud-border);
  border-radius: 99px;
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--hud-text-dim);
}
.mm__to {
  font-size: 0.78rem;
  color: var(--hud-text-dim);
}
.mm__body {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.15rem 0 0;
  font-size: 1.05rem;
  overflow-wrap: anywhere;
  &--private {
    font-style: italic;
    color: var(--hud-text-faint);
  }
  svg {
    width: 1rem;
    height: 1rem;
    flex: none;
  }
}
.mm__done {
  display: grid;
  place-items: center;
  width: var(--hud-touch-min);
  height: var(--hud-touch-min);
  flex: none;
  border: 2px solid var(--hud-border-bright);
  border-radius: 50%;
  background: none;
  color: transparent;
  cursor: pointer;
  &--on {
    background: var(--hud-success);
    border-color: var(--hud-success);
    color: var(--hud-primary-contrast);
  }
  svg {
    width: 1.4rem;
    height: 1.4rem;
    stroke-width: 3;
  }
}
.mm__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 3rem 1rem;
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
.mm__tip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  svg {
    width: 1rem;
    height: 1rem;
    color: var(--hud-warning);
  }
}
.mm__side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  overflow-y: auto;
  padding-top: 1rem;
}
.mm__examples {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  li {
    padding: 0.5rem 0.7rem;
    border: 1px dashed var(--hud-border);
    border-radius: 0.6rem;
    font-size: 0.78rem;
    font-style: italic;
    color: var(--hud-text-dim);
  }
}
</style>
