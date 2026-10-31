<script setup lang="ts">
import { Check, PartyPopper, Trophy } from 'lucide-vue-next'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import HudPanel from '@/components/hud/HudPanel.vue'
import LocalMic from '@/components/voice/LocalMic.vue'
import { useChoreStore } from '@/stores/chores'
import { useFamilyStore } from '@/stores/family'

const chores = useChoreStore()
const family = useFamilyStore()
const router = useRouter()

const accentOf = (id: string) => `var(--hud-accent-${family.byId.get(id)?.accent ?? 'blue'})`

// Transient "+20" burst on the row that was just completed.
const bursts = ref<Record<string, number>>({})
async function complete(id: string) {
  const done = await chores.complete(id)
  if (!done) return
  bursts.value[id] = done.pointsAwarded
  setTimeout(() => delete bursts.value[id], 1600)
}
</script>

<template>
  <HudPanel title="Chores" :icon="Trophy" expandable expand-label="Open chores" @expand="router.push('/tasks')">
    <div class="cp">
      <ul v-if="chores.visible.length" class="cp__list" data-testid="chore-list">
        <li v-for="c in chores.visible" :key="c.id">
          <button
            type="button"
            class="cp__row"
            :class="{ 'cp__row--done': chores.isDone(c) }"
            :aria-label="`${c.title}, ${family.nameOf(c.assigneeId)}, ${c.points} points${chores.isDone(c) ? ', complete' : ''}`"
            :aria-disabled="chores.isDone(c)"
            :data-testid="`chore-${c.id}`"
            @click="complete(c.id)"
          >
            <span class="cp__box"><Check v-if="chores.isDone(c)" aria-hidden="true" /></span>
            <span class="cp__text">
              <span class="cp__title">{{ c.title }}</span>
              <span class="cp__detail">{{ c.detail }} · <b :style="{ color: accentOf(c.assigneeId) }">{{ family.nameOf(c.assigneeId) }}</b></span>
            </span>
            <span class="cp__pts">+{{ c.points }}</span>
            <span v-if="bursts[c.id]" class="cp__burst" aria-hidden="true">+{{ bursts[c.id] }}</span>
          </button>
        </li>
      </ul>
      <div v-else class="cp__empty" data-testid="chores-empty">
        <PartyPopper aria-hidden="true" />
        <strong>No chores assigned</strong>
        <span>{{ family.selected ? `${family.selected.name} is all clear!` : 'Everyone is all clear!' }}</span>
      </div>

      <LocalMic label="Chores by voice" :context="{ feature: 'chores', activeModal: 'chores-preview', operation: 'complete' }" />
    </div>
  </HudPanel>
</template>

<style scoped lang="scss">
.cp {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  min-height: 0;
}
.cp__list {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  @include fade-bottom;
}
.cp__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 3.1rem;
  padding: 0 0.2rem;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--hud-border) 55%, transparent);
  background: none;
  text-align: left;
  cursor: pointer;
  &:active:not(.cp__row--done) {
    background: color-mix(in srgb, var(--hud-primary) 10%, transparent);
  }
  &--done {
    cursor: default;
    .cp__title {
      text-decoration: line-through;
      color: var(--hud-text-faint);
    }
    .cp__pts {
      opacity: 0.4;
    }
  }
}
.cp__box {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  flex: none;
  border: 2px solid var(--hud-border-bright);
  border-radius: 0.35rem;
  .cp__row--done & {
    background: var(--hud-success);
    border-color: var(--hud-success);
    color: var(--hud-primary-contrast);
  }
  svg {
    width: 1rem;
    height: 1rem;
    stroke-width: 3;
  }
}
.cp__text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  line-height: 1.15;
}
.cp__title {
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp__detail {
  font-size: 0.72rem;
  b {
    font-weight: 700;
  }
  color: var(--hud-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp__pts {
  min-width: 2.2rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--hud-warning);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.cp__burst {
  position: absolute;
  right: 0.4rem;
  top: 0;
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--hud-success);
  text-shadow: 0 0 0.6rem var(--hud-success);
  pointer-events: none;
  animation: burst 1.5s ease-out forwards;
}
@keyframes burst {
  from { transform: translateY(0.8rem); opacity: 0; }
  20% { opacity: 1; }
  to { transform: translateY(-1.2rem); opacity: 0; }
}
.cp__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
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
</style>
