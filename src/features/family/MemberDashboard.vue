<script setup lang="ts">
import { ArrowLeft, Award, Bell, CalendarDays, Check, ChevronRight, Flame, Image as ImageIcon, MessageCircle, Star, Target, Trophy } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import EventRow from '@/components/calendar/EventRow.vue'
import HudButton from '@/components/hud/HudButton.vue'
import HudIconButton from '@/components/hud/HudIconButton.vue'
import HudPanel from '@/components/hud/HudPanel.vue'
import HudSegmented from '@/components/hud/HudSegmented.vue'
import MemberAvatar from '@/components/hud/MemberAvatar.vue'
import ProgressRing from '@/components/hud/ProgressRing.vue'
import AchievementBadge from '@/features/chores/AchievementBadge.vue'
import { WEEKLY_POINT_TARGET } from '@/features/chores/scoring'
import { eventAccent } from '@/features/calendar/layout'
import { useCalendarStore } from '@/stores/calendar'
import { useChoreStore } from '@/stores/chores'
import { useClockStore } from '@/stores/clock'
import { useFamilyStore } from '@/stores/family'
import { useMessageStore } from '@/stores/messages'
import { usePhotoStore } from '@/stores/photos'
import { addDays, formatRelative, isSameDay, startOfDay } from '@/utils/date'

/**
 * Individual experience: everything here is already scoped by the global
 * member filter, so the same stores serve this view and the family view.
 */
const family = useFamilyStore()
const calendar = useCalendarStore()
const chores = useChoreStore()
const messages = useMessageStore()
const photos = usePhotoStore()
const clock = useClockStore()
const router = useRouter()

const member = computed(() => family.selected!)
const accent = computed(() => `var(--hud-accent-${member.value.accent})`)

// today / week / upcoming
const todayEvents = computed(() => calendar.today)
const nextId = computed(() => calendar.nextToday?.id)
const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(clock.weekStart, i)))
const week = computed(() =>
  weekDays.value.map((d) => ({
    d,
    today: isSameDay(d, clock.today),
    bars: calendar.onDay(d).slice(0, 4).map((e) => eventAccent(e, family.byId)),
  })),
)
const upcoming = computed(() => {
  const seen = new Set<string>()
  const from = startOfDay(addDays(clock.today, 1))
  const to = addDays(from, 21)
  return calendar.visible
    .filter((e) => {
      const s = new Date(e.start)
      if (s < from || s >= to) return false
      if (e.seriesId && (e.category === 'school' || e.category === 'work')) return false // routine
      const key = e.seriesId ?? e.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 4)
})

// chores
type Tab = 'todo' | 'done'
const tab = ref<Tab>('todo')
const choreRows = computed(() => {
  const list = chores.visible
  return tab.value === 'todo' ? list.filter((c) => !chores.isDone(c)) : list.filter((c) => chores.isDone(c))
})
const todoCount = computed(() => chores.visible.filter((c) => !chores.isDone(c)).length)
const bursts = ref<Record<string, number>>({})
async function complete(id: string) {
  const done = await chores.complete(id)
  if (!done) return
  bursts.value[id] = done.pointsAwarded
  setTimeout(() => delete bursts.value[id], 1600)
}

const feed = computed(() => messages.feed.slice(0, 4))
const preview = (m: (typeof feed.value)[number]) => (messages.canReveal(m) ? m.text : 'Private message')
const recent = computed(() => photos.visible.slice(0, 6))
const dayShort = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })
const monthShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
</script>

<template>
  <div class="md" data-testid="member-dashboard" :style="{ '--accent': accent }">
    <HudPanel variant="primary" class="md__profile">
      <div class="md__profile-in">
        <HudButton data-testid="back-to-family" @click="family.clear()">
          <template #icon><ArrowLeft /></template>
          Family view
        </HudButton>
        <MemberAvatar :member="member" size="4.4rem" />
        <div class="md__who">
          <h2>{{ member.name }}</h2>
          <p class="md__role">
            {{ member.role === 'administrator' ? 'Administrator' : 'Family Member' }}<template v-if="member.age"> · Age {{ member.age }}</template>
          </p>
          <p v-if="member.profile?.interests.length" class="md__tags">{{ member.profile.interests.join(' · ') }}</p>
          <p v-if="member.profile?.motto" class="md__motto">“{{ member.profile.motto }}”</p>
        </div>

        <div class="md__level">
          <div class="md__level-top">
            <Star aria-hidden="true" /><b>Level {{ chores.level.level }}</b>
            <span v-if="chores.level.nextFloor !== null">{{ chores.total }} / {{ chores.level.nextFloor }} points</span>
            <span v-else>Max level</span>
          </div>
          <div class="md__xp"><i :style="{ width: `${chores.level.progress * 100}%` }" /></div>
          <ul class="md__stats">
            <li><Flame aria-hidden="true" /><b>{{ chores.streak }}</b> day streak</li>
            <li><Trophy aria-hidden="true" /><b>{{ chores.badges.length }}</b> badges</li>
            <li><Target aria-hidden="true" /><b>{{ chores.openCount }}</b> chores to do</li>
          </ul>
        </div>
        <ProgressRing :value="chores.weekly / WEEKLY_POINT_TARGET" size="5rem">
          <strong class="md__pts" data-testid="weekly-points">{{ chores.weekly }}</strong>
          <span class="md__pts-l">this week</span>
        </ProgressRing>
      </div>
    </HudPanel>

    <HudPanel title="Today’s schedule" :icon="CalendarDays" expandable expand-label="Open calendar" class="md__today" @expand="router.push('/calendar')">
      <ul v-if="todayEvents.length" class="md__list" data-testid="member-today">
        <li v-for="e in todayEvents" :key="e.id"><EventRow :event="e" :past="new Date(e.end) <= clock.now" :next="e.id === nextId" /></li>
      </ul>
      <p v-else class="md__none">{{ member.name }}’s day is free!</p>
    </HudPanel>

    <HudPanel title="This week" :icon="CalendarDays" variant="quiet" class="md__week">
      <ol class="md__days" aria-label="This week">
        <li v-for="w in week" :key="w.d.toISOString()" :class="{ 'md__day--today': w.today }">
          <span>{{ dayShort(w.d) }}</span><b>{{ w.d.getDate() }}</b>
          <i v-for="(c, i) in w.bars" :key="i" :style="{ background: c }" />
        </li>
      </ol>
    </HudPanel>

    <HudPanel title="Achievements" :icon="Award" variant="quiet" class="md__ach">
      <div v-if="chores.badges.length" class="md__badges"><AchievementBadge v-for="b in chores.badges.slice(0, 4)" :key="b.id" :badge="b" /></div>
      <p v-else class="md__none">No badges yet. Finish a chore to start earning them.</p>
    </HudPanel>

    <HudPanel title="Chores" :icon="Trophy" expandable expand-label="Open chores" class="md__chores" @expand="router.push('/tasks')">
      <template #actions>
        <HudSegmented
          v-model="tab"
          compact
          label="Chores"
          :options="[
            { value: 'todo', label: `To do ${todoCount}` },
            { value: 'done', label: 'Done' },
          ]"
        />
      </template>
      <ul v-if="choreRows.length" class="md__list md__list--chores" data-testid="member-chores">
        <li v-for="c in choreRows" :key="c.id">
          <button type="button" class="md__chore" :class="{ 'md__chore--done': chores.isDone(c) }" :data-testid="`chore-${c.id}`" :aria-label="`${c.title}, ${c.points} points${chores.isDone(c) ? ', complete' : ''}`" @click="complete(c.id)">
            <span class="md__box"><Check v-if="chores.isDone(c)" aria-hidden="true" /></span>
            <span class="md__chore-t"><b>{{ c.title }}</b><small>{{ c.detail }}</small></span>
            <span class="md__chore-p">+{{ c.points }}</span>
            <span v-if="bursts[c.id]" class="md__burst" aria-hidden="true">+{{ bursts[c.id] }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="md__none">{{ tab === 'todo' ? 'All done. Nice work!' : 'Nothing here yet.' }}</p>
    </HudPanel>

    <HudPanel title="Upcoming events" :icon="CalendarDays" expandable expand-label="Open calendar" class="md__up" @expand="router.push('/calendar')">
      <ul v-if="upcoming.length" class="md__upcoming" data-testid="member-upcoming">
        <li v-for="e in upcoming" :key="e.id">
          <span class="md__date"><small>{{ monthShort(new Date(e.start)) }}</small><b>{{ new Date(e.start).getDate() }}</b></span>
          <span class="md__up-t"><b>{{ e.title }}</b><small>{{ e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }}<template v-if="e.location"> · {{ e.location }}</template></small></span>
        </li>
      </ul>
      <p v-else class="md__none">Nothing coming up.</p>
    </HudPanel>

    <HudPanel title="Messages & notes" :icon="MessageCircle" expandable expand-label="Open messages" class="md__msgs" @expand="router.push('/messages')">
      <ul v-if="feed.length" class="md__feed">
        <li v-for="m in feed" :key="m.id">
          <span v-if="m.type === 'reminder'" class="md__bell"><Bell aria-hidden="true" /></span>
          <MemberAvatar v-else :member="m.senderId === 'family' ? null : (family.byId.get(m.senderId) ?? null)" size="2rem" />
          <span class="md__feed-t"><b>{{ m.type === 'reminder' ? 'Reminder' : family.nameOf(m.senderId) }}</b><small>{{ preview(m) }}</small></span>
          <time>{{ formatRelative(new Date(m.at), clock.now) }}</time>
        </li>
      </ul>
      <p v-else class="md__none">No messages for {{ member.name }}.</p>
    </HudPanel>

    <HudPanel variant="quiet" class="md__photos">
      <div class="md__photos-row">
        <span class="md__photos-label"><ImageIcon aria-hidden="true" /><b class="hud-display">{{ member.name }}’s photos</b></span>
        <ul v-if="recent.length" class="md__strip" data-testid="member-photos">
          <li v-for="p in recent" :key="p.id"><button type="button" :aria-label="`Open ${p.caption}`" @click="router.push('/photos')"><img :src="p.url" :alt="p.caption" /></button></li>
        </ul>
        <p v-else class="md__none">No photos yet.</p>
        <HudIconButton label="Open photos" @click="router.push('/photos')"><ChevronRight /></HudIconButton>
      </div>
    </HudPanel>
  </div>
</template>

<style scoped lang="scss">
.md {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: auto minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 0.7rem;
  height: 100%;
  min-height: 0;
}
.md__profile {
  grid-column: 1 / -1;
}
.md__profile-in {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.1rem 0.4rem 0.1rem 0;
}
.md__who {
  min-width: 0;
  h2 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--hud-text);
    text-shadow: 0 0 1rem color-mix(in srgb, var(--accent) 50%, transparent);
  }
  p {
    margin: 0;
  }
}
.md__role {
  color: var(--accent);
  font-weight: 600;
}
.md__tags {
  font-size: 0.8rem;
  color: var(--hud-text-dim);
}
.md__motto {
  font-size: 0.8rem;
  font-style: italic;
  color: var(--hud-text-dim);
}
.md__level {
  flex: 1;
  min-width: 0;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--hud-border);
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--hud-bg-deep) 45%, transparent);
}
.md__level-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  svg {
    width: 1.5rem;
    height: 1.5rem;
    color: var(--hud-warning);
  }
  b {
    font-size: 1.3rem;
  }
  span {
    margin-left: auto;
    font-size: 0.85rem;
    color: var(--hud-text-dim);
  }
}
.md__xp {
  height: 0.55rem;
  margin: 0.4rem 0 0.5rem;
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
.md__stats {
  display: flex;
  gap: 1.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.82rem;
  color: var(--hud-text-dim);
  li {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  svg {
    width: 1.3rem;
    height: 1.3rem;
    color: var(--hud-warning);
  }
  b {
    font-size: 1.2rem;
    color: var(--hud-text);
  }
}
.md__pts {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1;
}
.md__pts-l {
  font-size: 0.68rem;
  color: var(--hud-text-dim);
}

.md__list,
.md__upcoming,
.md__feed {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0 0.2rem 0 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  overflow-y: auto;
  @include fade-bottom;
}
.md__list :deep(.ev) {
  grid-template-columns: 3.8rem minmax(0, 1fr);
}
.md__list :deep(.ev__card) {
  min-height: 2.9rem;
}
.md__none {
  margin: auto;
  text-align: center;
  color: var(--hud-text-dim);
}

.md__days {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
  li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.3rem 0;
    border-radius: 0.5rem;
    span {
      font-size: 0.7rem;
      text-transform: uppercase;
      color: var(--hud-text-dim);
    }
    b {
      font-size: 1.05rem;
      font-weight: 500;
    }
    i {
      width: 78%;
      height: 0.45rem;
      border-radius: 99px;
    }
  }
}
.md__day--today {
  border: 1px solid var(--hud-primary);
  background: color-mix(in srgb, var(--hud-primary) 10%, transparent);
}
.md__badges {
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  gap: 0.3rem;
  overflow: hidden;
}

.md__chore {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 3rem;
  padding: 0 0.3rem;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--hud-border) 55%, transparent);
  background: none;
  text-align: left;
  cursor: pointer;
  &--done {
    cursor: default;
    opacity: 0.55;
    .md__chore-t b {
      text-decoration: line-through;
    }
  }
}
.md__box {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  flex: none;
  border: 2px solid var(--hud-border-bright);
  border-radius: 0.35rem;
  .md__chore--done & {
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
.md__chore-t,
.md__up-t,
.md__feed-t {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  line-height: 1.2;
  b {
    font-size: 0.95rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    font-size: 0.74rem;
    color: var(--hud-text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.md__chore-p {
  font-weight: 700;
  color: var(--hud-warning);
}
.md__burst {
  position: absolute;
  right: 0.5rem;
  font-size: 1.2rem;
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

.md__upcoming li {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-height: 3rem;
  border-bottom: 1px solid color-mix(in srgb, var(--hud-border) 55%, transparent);
}
.md__date {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 2.8rem;
  padding: 0.15rem 0;
  border: 1px solid var(--hud-border-bright);
  border-radius: 0.5rem;
  line-height: 1.1;
  small {
    font-size: 0.6rem;
    letter-spacing: 0.08em;
    color: var(--hud-primary);
  }
  b {
    font-size: 1.15rem;
  }
}
.md__feed li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.9rem;
  border-bottom: 1px solid color-mix(in srgb, var(--hud-border) 55%, transparent);
  time {
    font-size: 0.68rem;
    color: var(--hud-text-faint);
    white-space: nowrap;
  }
}
.md__bell {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  flex: none;
  border: 0.14rem solid var(--hud-primary);
  border-radius: 50%;
  color: var(--hud-primary);
  svg {
    width: 1rem;
    height: 1rem;
  }
}

.md__photos {
  grid-column: 1 / -1;
  height: 5.4rem;
}
.md__photos-row {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0.4rem 0.5rem 0.2rem;
}
.md__photos-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 9rem;
  flex: none;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  svg {
    width: 1.4rem;
    height: 1.4rem;
    flex: none;
    color: var(--hud-primary);
  }
  b {
    font-weight: 600;
  }
}
.md__strip {
  flex: 1;
  align-self: stretch;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
  li,
  button {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  button {
    padding: 0;
    border: 1px solid var(--hud-border);
    border-radius: 0.5rem;
    overflow: hidden;
    background: none;
    cursor: pointer;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
</style>
