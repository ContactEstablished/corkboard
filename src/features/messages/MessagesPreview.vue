<script setup lang="ts">
import { Bell, Lightbulb, MessageCircle, StickyNote } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import HudPanel from '@/components/hud/HudPanel.vue'
import MemberAvatar from '@/components/hud/MemberAvatar.vue'
import LocalMic from '@/components/voice/LocalMic.vue'
import { type FeedItem, useMessageStore } from '@/stores/messages'
import { useClockStore } from '@/stores/clock'
import { useFamilyStore } from '@/stores/family'
import { formatRelative, formatTime } from '@/utils/date'

const messages = useMessageStore()
const family = useFamilyStore()
const clock = useClockStore()
const router = useRouter()

/** Private messages never expose their body on the shared front-door screen. */
const preview = (m: FeedItem) => (m.private ? 'Private message' : m.text)

function when(m: FeedItem): string {
  const at = new Date(m.at)
  if (m.type === 'reminder' && at > clock.now) return `Due ${formatTime(at)}`
  return formatRelative(at, clock.now)
}
const label = (m: FeedItem) => (m.type === 'reminder' ? 'Reminder' : family.nameOf(m.senderId))
</script>

<template>
  <HudPanel title="Messages & notes" :icon="MessageCircle" expandable expand-label="Open messages" @expand="router.push('/messages')">
    <div class="mp">
      <ul v-if="messages.feed.length" class="mp__list" data-testid="message-list">
        <li v-for="m in messages.feed" :key="m.id" class="mp__row">
          <span v-if="m.type === 'reminder'" class="mp__badge" aria-hidden="true"><Bell /></span>
          <span v-else-if="m.type === 'note'" class="mp__badge" aria-hidden="true"><StickyNote /></span>
          <MemberAvatar v-else :member="m.senderId === 'family' ? null : (family.byId.get(m.senderId) ?? null)" size="2.2rem" />
          <span class="mp__text">
            <span class="mp__top">
              <b>{{ label(m) }}</b>
              <time>{{ when(m) }}</time>
            </span>
            <span class="mp__body" :class="{ 'mp__body--private': m.private }">{{ preview(m) }}</span>
          </span>
        </li>
      </ul>
      <div v-else class="mp__empty" data-testid="messages-empty">
        <MessageCircle aria-hidden="true" />
        <strong>No messages yet</strong>
        <span class="mp__tip"><Lightbulb aria-hidden="true" /> Try “Send everyone a message that dinner is at six”</span>
      </div>

      <LocalMic label="Add message or note by voice" :context="{ feature: 'messages', activeModal: 'messages-preview', operation: 'send' }" />
    </div>
  </HudPanel>
</template>

<style scoped lang="scss">
.mp {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  min-height: 0;
}
.mp__list {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  @include fade-bottom;
}
.mp__row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 3.1rem;
  padding: 0.25rem 0.2rem;
  border-bottom: 1px solid color-mix(in srgb, var(--hud-border) 55%, transparent);
}
.mp__badge {
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  flex: none;
  border: 0.14rem solid var(--hud-primary);
  border-radius: 50%;
  color: var(--hud-primary);
  svg {
    width: 1.1rem;
    height: 1.1rem;
  }
}
.mp__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  line-height: 1.2;
}
.mp__top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.82rem;
  time {
    font-size: 0.68rem;
    color: var(--hud-text-faint);
    white-space: nowrap;
  }
}
.mp__body {
  font-size: 0.82rem;
  color: var(--hud-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  &--private {
    font-style: italic;
    color: var(--hud-text-faint);
  }
}
.mp__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  text-align: center;
  color: var(--hud-text-dim);
  > svg {
    width: 2.6rem;
    height: 2.6rem;
    color: var(--hud-primary);
  }
  strong {
    color: var(--hud-text);
  }
}
.mp__tip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  svg {
    width: 0.95rem;
    height: 0.95rem;
    color: var(--hud-warning);
  }
}
</style>
