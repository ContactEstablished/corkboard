<script setup lang="ts">
import { Check, Send, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'
import MemberAvatar from '@/components/hud/MemberAvatar.vue'
import type { ProposedAction } from '@/models'
import { useFamilyStore } from '@/stores/family'
import { useVoiceStore } from '@/stores/voice'

const props = defineProps<{ action: ProposedAction }>()
const family = useFamilyStore()
const voice = useVoiceStore()

// Recipients of an outgoing message can be changed by touch before sending.
const recipients = computed(() => (props.action.payload.kind === 'message.send' ? props.action.payload.recipientIds : null))
const isTo = (id: string) => recipients.value !== 'everyone' && !!recipients.value?.includes(id)
function toggleTo(id: string) {
  const cur = recipients.value
  if (cur === null) return
  if (cur === 'everyone') return voice.setRecipients([id])
  voice.setRecipients(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
}

const memberFor = (id?: string) => (id ? (family.byId.get(id) ?? null) : null)
const notice = computed(() => {
  if (props.action.destructive) return { kind: 'danger', icon: Trash2, text: 'This will remove items. Nothing is deleted until you confirm.' }
  if (props.action.outgoing) return { kind: 'info', icon: Send, text: 'Others will see this. Check it before sending.' }
  return null
})
</script>

<template>
  <section class="preview" aria-label="Interpreted action" data-testid="action-preview">
    <header class="preview__head">
      <h3 class="preview__title">{{ action.title }}</h3>
    </header>

    <ul v-if="action.items?.length" class="preview__items">
      <li v-for="item in action.items" :key="item" class="preview__item">
        <Check class="preview__tick" aria-hidden="true" />
        <span class="preview__item-text">{{ item }}</span>
      </li>
    </ul>

    <dl v-if="action.fields.length" class="preview__fields">
      <template v-for="f in action.fields" :key="f.label">
        <dt>{{ f.label }}</dt>
        <dd>
          <MemberAvatar v-if="f.memberId && memberFor(f.memberId)" :member="memberFor(f.memberId)" size="1.7rem" />
          <span class="preview__value">{{ f.value }}</span>
        </dd>
      </template>
    </dl>

    <div v-if="recipients !== null" class="preview__to" role="group" aria-label="Who should get this message?" data-testid="recipient-picker">
      <span class="preview__to-label">Send to</span>
      <button type="button" class="preview__every" :class="{ 'preview__every--on': recipients === 'everyone' }" :aria-pressed="recipients === 'everyone'" @click="voice.setRecipients('everyone')">Everyone</button>
      <MemberAvatar v-for="m in family.members" :key="m.id" :member="m" size="2rem" show-name interactive :selected="isTo(m.id)" :dimmed="!isTo(m.id)" @select="toggleTo(m.id)" />
    </div>

    <p v-if="notice" class="preview__notice" :class="`preview__notice--${notice.kind}`">
      <component :is="notice.icon" aria-hidden="true" />
      {{ notice.text }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.preview {
  border: 1px solid var(--hud-border);
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--hud-bg-deep) 55%, transparent);
  padding: 0.8rem 1rem 0.9rem;
  text-align: left;
}
.preview__title {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--hud-primary);
}
.preview__items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.preview__item {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  max-width: 100%;
  min-height: 2.5rem;
  padding: 0 0.9rem;
  border: 1px solid var(--hud-border-bright);
  border-radius: 999px;
  background: color-mix(in srgb, var(--hud-primary) 10%, transparent);
  font-size: 1.05rem;
}
.preview__item-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview__tick {
  width: 1.1rem;
  height: 1.1rem;
  color: var(--hud-success);
  flex: none;
}
.preview__fields {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.45rem 1rem;
  margin: 0;
  dt {
    align-self: center;
    color: var(--hud-text-dim);
    font-size: 0.9rem;
  }
  dd {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    margin: 0;
    padding: 0.35rem 0.7rem;
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--hud-surface) 70%, transparent);
    font-size: 1.05rem;
  }
}
.preview__value {
  overflow-wrap: anywhere;
}
.preview__to {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.7rem;
  margin-top: 0.7rem;
}
.preview__to-label {
  font-size: 0.85rem;
  color: var(--hud-text-dim);
}
.preview__every {
  min-height: var(--hud-touch-min);
  padding: 0 1rem;
  border: 1px solid var(--hud-border);
  border-radius: 999px;
  background: none;
  color: var(--hud-text-dim);
  font-weight: 600;
  cursor: pointer;
  &--on {
    color: var(--hud-text);
    border-color: var(--hud-primary);
    background: color-mix(in srgb, var(--hud-primary) 18%, transparent);
  }
}
.preview__notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.7rem 0 0;
  padding: 0.45rem 0.7rem;
  border-radius: 0.5rem;
  font-size: 0.88rem;
  svg {
    width: 1.1rem;
    height: 1.1rem;
    flex: none;
  }
  &--danger {
    background: color-mix(in srgb, var(--hud-danger) 15%, transparent);
    color: color-mix(in srgb, var(--hud-danger) 60%, white);
  }
  &--info {
    background: color-mix(in srgb, var(--hud-warning) 12%, transparent);
    color: color-mix(in srgb, var(--hud-warning) 70%, white);
  }
}
</style>
