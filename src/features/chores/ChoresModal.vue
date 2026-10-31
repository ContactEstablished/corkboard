<script setup lang="ts">
import { Check, Flame, PartyPopper, Pencil, Plus, Star, Trophy } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import FeatureModal from '@/components/hud/FeatureModal.vue'
import HudButton from '@/components/hud/HudButton.vue'
import HudSegmented from '@/components/hud/HudSegmented.vue'
import MemberAvatar from '@/components/hud/MemberAvatar.vue'
import ProgressRing from '@/components/hud/ProgressRing.vue'
import LocalMic from '@/components/voice/LocalMic.vue'
import { describeRecurrence } from '@/features/calendar/recurrence'
import type { Chore } from '@/models'
import { useChoreStore } from '@/stores/chores'
import { useClockStore } from '@/stores/clock'
import { useFamilyStore } from '@/stores/family'
import { formatRelative } from '@/utils/date'
import AchievementBadge from './AchievementBadge.vue'
import ChoreEditor from './ChoreEditor.vue'
import { CHORE_ICONS } from './choreIcon'
import { dueLabel } from './occurrence'
import { WEEKLY_POINT_TARGET } from './scoring'

defineProps<{ open: boolean }>()
defineEmits<{ close: [] }>()

const chores = useChoreStore()
const family = useFamilyStore()
const clock = useClockStore()

type Tab = 'todo' | 'done' | 'all'
const tab = ref<Tab>('todo')
const editing = ref<Chore | null>(null)
const creating = ref(false)

const rows = computed(() => {
  const list = chores.defined
  if (tab.value === 'todo') return list.filter((r) => r.dueToday && !r.done)
  if (tab.value === 'done') return list.filter((r) => r.done)
  return list
})
const counts = computed(() => ({
  todo: chores.defined.filter((r) => r.dueToday && !r.done).length,
  done: chores.defined.filter((r) => r.done).length,
}))
const tabOptions = computed(() => [
  { value: 'todo' as const, label: `To do (${counts.value.todo})` },
  { value: 'done' as const, label: `Done (${counts.value.done})` },
  { value: 'all' as const, label: 'All' },
])

const bursts = ref<Record<string, number>>({})
async function complete(id: string) {
  const done = await chores.complete(id)
  if (!done) return
  bursts.value[id] = done.pointsAwarded
  setTimeout(() => delete bursts.value[id], 1600)
}

/** One progress card per member, or just the selected member's. */
const people = computed(() => (family.selected ? [family.selected] : family.members))
const statsFor = (id: string) => chores.memberStats(id)
const accent = (id: string) => `var(--hud-accent-${family.byId.get(id)?.accent ?? 'blue'})`
const goalPct = computed(() => Math.min(1, chores.familyGoal.done / chores.familyGoal.target))
const emptyText = computed(() => ({ todo: 'Everything is done. Nice work!', done: 'Nothing completed yet today.', all: 'No chores yet. Add one!' })[tab.value])
</script>

<template>
  <FeatureModal :open="open" title="Chores" :icon="Trophy" @close="$emit('close')">
    <template #actions>
      <HudButton variant="primary" data-testid="chore-new" @click="creating = true">
        <template #icon><Plus /></template>
        New chore
      </HudButton>
    </template>

    <div class="cm" data-testid="chores-modal">
      <section class="cm__main">
        <HudSegmented v-model="tab" label="Chore filter" :options="tabOptions" />

        <ul v-if="rows.length" class="cm__list" data-testid="chores-modal-list">
          <li v-for="r in rows" :key="r.chore.id" class="cm__row" :class="{ 'cm__row--done': r.done }" :style="{ '--accent': accent(r.chore.assigneeId) }">
            <button
              type="button"
              class="cm__check"
              :class="{ 'cm__check--on': r.done, 'cm__check--off': !r.dueToday }"
              :disabled="r.done || !r.dueToday"
              :aria-label="r.done ? `${r.chore.title} complete` : r.dueToday ? `Complete ${r.chore.title}` : `${r.chore.title} is not due today`"
              :data-testid="`modal-chore-${r.chore.id}`"
              @click="complete(r.chore.id)"
            >
              <Check v-if="r.done" aria-hidden="true" />
            </button>
            <component :is="CHORE_ICONS[r.chore.icon]" class="cm__icon" aria-hidden="true" />
            <div class="cm__text">
              <span class="cm__title">{{ r.chore.title }}</span>
              <span class="cm__meta">{{ r.chore.detail }} · {{ describeRecurrence(r.chore.recurrence) }} ·
                <template v-if="r.done">Done today</template>
                <template v-else>Due {{ dueLabel(r.next, clock.today) }}</template>
              </span>
            </div>
            <MemberAvatar :member="family.byId.get(r.chore.assigneeId) ?? null" size="2.1rem" show-name />
            <span class="cm__pts">+{{ r.chore.points }}</span>
            <span v-if="bursts[r.chore.id]" class="cm__burst" aria-hidden="true">+{{ bursts[r.chore.id] }} pts!</span>
            <button type="button" class="cm__edit" :aria-label="`Edit ${r.chore.title}`" @click="editing = r.chore"><Pencil /></button>
          </li>
        </ul>
        <div v-else class="cm__empty" data-testid="chores-modal-empty">
          <PartyPopper aria-hidden="true" />
          <strong>{{ emptyText }}</strong>
        </div>
      </section>

      <aside class="cm__side">
        <section class="cm__card cm__goal" aria-label="Family goal">
          <header><h3>Family goal</h3><span>{{ clock.weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }} week</span></header>
          <p>Complete {{ chores.familyGoal.target }} chores this week</p>
          <div class="cm__bar"><i :style="{ width: `${goalPct * 100}%` }" /></div>
          <b>{{ chores.familyGoal.done }} / {{ chores.familyGoal.target }}</b>
        </section>

        <section class="cm__people" aria-label="Progress">
          <article v-for="m in people" :key="m.id" class="cm__person" :style="{ '--accent': accent(m.id) }">
            <ProgressRing :value="statsFor(m.id).weekly / WEEKLY_POINT_TARGET" size="3.6rem" :stroke="11">
              <MemberAvatar :member="m" size="2rem" />
            </ProgressRing>
            <div class="cm__person-text">
              <b>{{ m.name }}</b>
              <span>Level {{ statsFor(m.id).level.level }} · {{ statsFor(m.id).total }} pts</span>
              <span><Star aria-hidden="true" /> {{ statsFor(m.id).weekly }} this week
                <template v-if="statsFor(m.id).streak > 0"> · <Flame aria-hidden="true" /> {{ statsFor(m.id).streak }}-day streak</template></span>
            </div>
          </article>
        </section>

        <section v-if="chores.badges.length" class="cm__card" aria-label="Badges">
          <h3>Badges</h3>
          <div class="cm__badges"><AchievementBadge v-for="b in chores.badges.slice(0, 6)" :key="b.id" :badge="b" /></div>
        </section>

        <section class="cm__card cm__history" aria-label="Recent activity">
          <h3>Recent activity</h3>
          <ul>
            <li v-for="h in chores.history.slice(0, 5)" :key="h.id">
              <MemberAvatar :member="family.byId.get(h.memberId) ?? null" size="1.7rem" />
              <span class="cm__hist-text"><b>{{ family.nameOf(h.memberId) }}</b> completed {{ h.choreTitle }}</span>
              <span class="cm__hist-pts">+{{ h.pointsAwarded }}</span>
              <time>{{ formatRelative(new Date(h.completedAt), clock.now) }}</time>
            </li>
          </ul>
        </section>

        <LocalMic label="Chores by voice" :context="{ feature: 'chores', activeModal: 'chores', operation: 'complete' }" />
      </aside>
    </div>

    <ChoreEditor :open="creating || !!editing" :chore="editing" @close="((creating = false), (editing = null))" />
  </FeatureModal>
</template>

<style scoped lang="scss">
.cm {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 21rem;
  grid-template-rows: minmax(0, 1fr);
  gap: 1.2rem;
}
.cm__main {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  min-height: 0;
  align-items: flex-start;
}
.cm__list {
  align-self: stretch;
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0 0.3rem 0 0;
  list-style: none;
  overflow-y: auto;
}
.cm__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-height: 4.3rem;
  margin-bottom: 0.45rem;
  padding: 0.3rem 0.4rem 0.3rem 0.8rem;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  border-left: 0.28rem solid var(--accent);
  border-radius: 0.8rem;
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 12%, var(--hud-panel)), var(--hud-panel));
  &--done {
    opacity: 0.6;
    .cm__title {
      text-decoration: line-through;
    }
  }
}
.cm__check {
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  flex: none;
  padding: 0;
  border: 2px solid var(--hud-border-bright);
  border-radius: 0.6rem;
  background: none;
  color: var(--hud-primary-contrast);
  cursor: pointer;
  &--on {
    background: var(--hud-success);
    border-color: var(--hud-success);
  }
  &--off {
    opacity: 0.35;
  }
  svg {
    width: 1.5rem;
    height: 1.5rem;
    stroke-width: 3;
  }
}
.cm__icon {
  width: 1.5rem;
  height: 1.5rem;
  flex: none;
  color: var(--hud-text-dim);
}
.cm__text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.cm__title {
  font-size: 1.15rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cm__meta {
  font-size: 0.8rem;
  color: var(--hud-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cm__pts {
  min-width: 3rem;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--hud-warning);
  text-align: right;
}
.cm__edit {
  display: grid;
  place-items: center;
  width: var(--hud-touch-min);
  height: var(--hud-touch-min);
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--hud-primary);
  cursor: pointer;
  svg {
    width: 1.3rem;
    height: 1.3rem;
  }
}
.cm__burst {
  position: absolute;
  right: 6rem;
  top: 0.2rem;
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--hud-success);
  text-shadow: 0 0 0.7rem var(--hud-success);
  pointer-events: none;
  animation: burst 1.5s ease-out forwards;
}
@keyframes burst {
  from { transform: translateY(0.8rem); opacity: 0; }
  20% { opacity: 1; }
  to { transform: translateY(-1.4rem); opacity: 0; }
}
.cm__empty {
  align-self: stretch;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  color: var(--hud-text-dim);
  > svg {
    width: 3.5rem;
    height: 3.5rem;
    color: var(--hud-primary);
  }
  strong {
    font-size: 1.2rem;
    color: var(--hud-text);
  }
}

.cm__side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8rem;
  min-height: 0;
  overflow-y: auto;
  padding: 0 0.2rem 0 0;
}
.cm__card {
  align-self: stretch;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--hud-border);
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--hud-bg-deep) 50%, transparent);
  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--hud-text-dim);
  }
}
.cm__goal {
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    h3 {
      color: var(--hud-primary);
    }
    span {
      font-size: 0.75rem;
      color: var(--hud-text-dim);
    }
  }
  p {
    margin: 0 0 0.5rem;
  }
  b {
    display: block;
    margin-top: 0.3rem;
    text-align: right;
    font-size: 1.1rem;
  }
}
.cm__bar {
  height: 0.55rem;
  border-radius: 99px;
  background: color-mix(in srgb, var(--hud-border) 50%, transparent);
  overflow: hidden;
  i {
    display: block;
    height: 100%;
    border-radius: 99px;
    background: linear-gradient(90deg, var(--hud-blue), var(--hud-primary));
    box-shadow: 0 0 0.6rem var(--hud-glow);
  }
}
.cm__people {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.cm__person {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.35rem 0.6rem;
  border-left: 0.25rem solid var(--accent);
  border-radius: 0.6rem;
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 12%, transparent), transparent);
}
.cm__person-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  b {
    color: var(--accent);
  }
  span {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.78rem;
    color: var(--hud-text-dim);
  }
  svg {
    width: 0.85rem;
    height: 0.85rem;
    color: var(--hud-warning);
  }
}
.cm__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 0.2rem;
}
.cm__history ul {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cm__history li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}
.cm__hist-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cm__hist-pts {
  font-weight: 700;
  color: var(--hud-warning);
}
.cm__history time {
  min-width: 3rem;
  text-align: right;
  font-size: 0.68rem;
  color: var(--hud-text-faint);
}
</style>
