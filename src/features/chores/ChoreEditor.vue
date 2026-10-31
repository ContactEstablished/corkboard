<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import { computed, reactive, watch } from 'vue'
import ConfirmButton from '@/components/hud/ConfirmButton.vue'
import HudButton from '@/components/hud/HudButton.vue'
import HudModal from '@/components/hud/HudModal.vue'
import MemberAvatar from '@/components/hud/MemberAvatar.vue'
import { describeRecurrence } from '@/features/calendar/recurrence'
import type { Chore, ChoreIcon, ID, RecurrenceRule } from '@/models'
import { useChoreStore } from '@/stores/chores'
import { useClockStore } from '@/stores/clock'
import { useFamilyStore } from '@/stores/family'
import { toISODate } from '@/utils/date'
import { CHORE_TEMPLATES } from './templates'

const props = defineProps<{ open: boolean; chore?: Chore | null }>()
const emit = defineEmits<{ close: [] }>()

const chores = useChoreStore()
const family = useFamilyStore()
const clock = useClockStore()

type Repeat = 'once' | 'daily' | 'weekly'
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const draft = reactive({
  title: '',
  detail: '',
  icon: 'generic' as ChoreIcon,
  assigneeId: '' as ID,
  points: 15,
  repeat: 'once' as Repeat,
  days: [] as number[],
})

// Reset the draft each time the editor opens.
watch(
  () => [props.open, props.chore] as const,
  () => {
    if (!props.open) return
    const c = props.chore
    draft.title = c?.title ?? ''
    draft.detail = c?.detail ?? ''
    draft.icon = c?.icon ?? 'generic'
    draft.assigneeId = c?.assigneeId ?? family.selectedId ?? family.members[0]?.id ?? ''
    draft.points = c?.points ?? 15
    draft.repeat = !c?.recurrence ? 'once' : c.recurrence.freq === 'daily' ? 'daily' : 'weekly'
    draft.days = c?.recurrence?.byWeekday?.slice() ?? [clock.today.getDay()]
  },
  { immediate: true },
)

const valid = computed(() => draft.title.trim() !== '' && draft.assigneeId !== '' && (draft.repeat !== 'weekly' || draft.days.length > 0))
const summary = computed(() => describeRecurrence(recurrence()))

function recurrence(): RecurrenceRule | undefined {
  if (draft.repeat === 'daily') return { freq: 'daily' }
  if (draft.repeat === 'weekly') return { freq: 'weekly', byWeekday: draft.days.slice().sort() }
  return undefined
}

function pick(t: (typeof CHORE_TEMPLATES)[number]) {
  draft.title = t.title
  draft.detail = t.detail
  draft.icon = t.icon
  if (!props.chore) draft.points = t.points
}

function toggleDay(d: number) {
  draft.days = draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d]
}

async function save() {
  if (!valid.value) return
  await chores.save({
    id: props.chore?.id,
    title: draft.title,
    detail: draft.detail,
    icon: draft.icon,
    assigneeId: draft.assigneeId,
    points: draft.points,
    dueDate: props.chore?.dueDate ?? toISODate(clock.today),
    recurrence: recurrence(),
  })
  emit('close')
}

async function remove() {
  if (!props.chore) return
  await chores.remove(props.chore.id)
  emit('close')
}
</script>

<template>
  <HudModal :open="open" :title="chore ? 'Edit chore' : 'New chore'" size="lg" layer="top" :close-on-backdrop="false" @close="emit('close')">
    <div class="ce" data-testid="chore-editor">
      <section class="ce__sect">
        <h3>Chore</h3>
        <div class="ce__chips" role="group" aria-label="Chore ideas">
          <button
            v-for="t in CHORE_TEMPLATES"
            :key="t.title"
            type="button"
            class="ce__chip"
            :class="{ 'ce__chip--on': draft.title === t.title }"
            :aria-pressed="draft.title === t.title"
            @click="pick(t)"
          >
            {{ t.title }}
          </button>
        </div>
        <p v-if="draft.title && !CHORE_TEMPLATES.some((t) => t.title === draft.title)" class="ce__current">Current: {{ draft.title }}</p>
      </section>

      <section class="ce__sect">
        <h3>Assigned to</h3>
        <div class="ce__people" role="group" aria-label="Assignee">
          <MemberAvatar
            v-for="m in family.members"
            :key="m.id"
            :member="m"
            size="2.8rem"
            show-name
            interactive
            :selected="draft.assigneeId === m.id"
            :dimmed="draft.assigneeId !== m.id"
            @select="draft.assigneeId = m.id"
          />
        </div>
      </section>

      <section class="ce__row">
        <div class="ce__sect">
          <h3>Points</h3>
          <div class="ce__stepper">
            <button type="button" aria-label="Fewer points" :disabled="draft.points <= 5" @click="draft.points = Math.max(5, draft.points - 5)"><Minus /></button>
            <output data-testid="chore-points">{{ draft.points }}</output>
            <button type="button" aria-label="More points" :disabled="draft.points >= 100" @click="draft.points = Math.min(100, draft.points + 5)"><Plus /></button>
          </div>
        </div>
        <div class="ce__sect ce__sect--grow">
          <h3>Repeats</h3>
          <div class="ce__chips" role="group" aria-label="Repeat">
            <button v-for="r in (['once', 'daily', 'weekly'] as const)" :key="r" type="button" class="ce__chip" :class="{ 'ce__chip--on': draft.repeat === r }" :aria-pressed="draft.repeat === r" @click="draft.repeat = r">
              {{ r === 'once' ? 'Just once' : r === 'daily' ? 'Every day' : 'Weekly' }}
            </button>
          </div>
          <div v-if="draft.repeat === 'weekly'" class="ce__days" role="group" aria-label="Days of the week">
            <button v-for="(d, i) in DAYS" :key="i" type="button" class="ce__day" :class="{ 'ce__day--on': draft.days.includes(i) }" :aria-label="DAY_NAMES[i]" :aria-pressed="draft.days.includes(i)" @click="toggleDay(i)">{{ d }}</button>
          </div>
          <p class="ce__summary">{{ summary }}</p>
        </div>
      </section>

      <footer class="ce__foot">
        <ConfirmButton v-if="chore" label="Delete chore" confirm-label="Yes, delete" prompt="Delete this chore?" @confirm="remove" />
        <span class="ce__spacer" />
        <HudButton @click="emit('close')">Cancel</HudButton>
        <HudButton variant="primary" :disabled="!valid" data-testid="chore-save" @click="save">{{ chore ? 'Save changes' : 'Add chore' }}</HudButton>
      </footer>
    </div>
  </HudModal>
</template>

<style scoped lang="scss">
.ce {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.ce__sect {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  &--grow {
    flex: 1;
  }
  h3 {
    margin: 0;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--hud-text-dim);
  }
}
.ce__row {
  display: flex;
  gap: 2rem;
}
.ce__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.ce__chip {
  min-height: 2.9rem;
  padding: 0 1rem;
  border: 1px solid var(--hud-border);
  border-radius: 999px;
  background: none;
  color: var(--hud-text-dim);
  font-size: 0.95rem;
  cursor: pointer;
  &--on {
    color: var(--hud-text);
    border-color: var(--hud-primary);
    background: color-mix(in srgb, var(--hud-primary) 18%, transparent);
  }
}
.ce__current {
  margin: 0;
  font-size: 0.85rem;
  color: var(--hud-primary);
}
.ce__people {
  display: flex;
  gap: 0.8rem;
}
.ce__stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  button {
    display: grid;
    place-items: center;
    width: var(--hud-touch-min);
    height: var(--hud-touch-min);
    border: 1px solid var(--hud-border-bright);
    border-radius: 50%;
    background: color-mix(in srgb, var(--hud-surface) 70%, transparent);
    color: var(--hud-primary);
    cursor: pointer;
    &:disabled {
      opacity: 0.35;
    }
    svg {
      width: 1.2rem;
      height: 1.2rem;
    }
  }
  output {
    min-width: 3rem;
    text-align: center;
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--hud-warning);
  }
}
.ce__days {
  display: flex;
  gap: 0.4rem;
}
.ce__day {
  width: 2.9rem;
  height: 2.9rem;
  border: 1px solid var(--hud-border);
  border-radius: 50%;
  background: none;
  color: var(--hud-text-dim);
  font-weight: 700;
  cursor: pointer;
  &--on {
    color: var(--hud-text);
    border-color: var(--hud-primary);
    background: color-mix(in srgb, var(--hud-primary) 22%, transparent);
  }
}
.ce__summary {
  margin: 0;
  font-size: 0.85rem;
  color: var(--hud-primary);
}
.ce__foot {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--hud-border);
}
.ce__spacer {
  flex: 1;
}
</style>
