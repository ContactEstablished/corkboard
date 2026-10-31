<script setup lang="ts">
import { ChartNoAxesColumn, Flame, Home, Star } from 'lucide-vue-next'
import { computed } from 'vue'
import HudPanel from '@/components/hud/HudPanel.vue'
import ProgressRing from '@/components/hud/ProgressRing.vue'
import { WEEKLY_POINT_TARGET } from '@/features/chores/scoring'
import { useChoreStore } from '@/stores/chores'
import { useFamilyStore } from '@/stores/family'

/** Compact "This Week" visualization (the large family scoreboard is intentionally gone). */
const chores = useChoreStore()
const family = useFamilyStore()

const target = computed(() => WEEKLY_POINT_TARGET * (family.selectedId ? 1 : Math.max(1, family.members.length)))
const ringValue = computed(() => chores.weekly / target.value)
const doneToday = computed(() => chores.visible.filter((c) => chores.isDone(c)).length)
const goalPct = computed(() => Math.min(1, chores.familyGoal.done / chores.familyGoal.target))
</script>

<template>
  <HudPanel title="This week" :icon="ChartNoAxesColumn" variant="quiet">
    <div class="tw" data-testid="this-week">
      <ProgressRing :value="ringValue" size="6.4rem">
        <strong class="tw__pts" data-testid="weekly-points">{{ chores.weekly }}</strong>
        <span class="tw__unit">points</span>
      </ProgressRing>
      <ul class="tw__rows">
        <li>
          <Star aria-hidden="true" />
          <span>Chores today</span>
          <b>{{ doneToday }}/{{ chores.visible.length }}</b>
        </li>
        <li>
          <Flame aria-hidden="true" />
          <span>{{ family.selected ? `Level ${chores.level.level}` : 'All-time points' }}</span>
          <b>{{ chores.total }}{{ family.selected ? ' pts' : '' }}</b>
        </li>
        <li class="tw__goal">
          <Home aria-hidden="true" />
          <span>Family goal</span>
          <b>{{ chores.familyGoal.done }}/{{ chores.familyGoal.target }}</b>
          <i class="tw__bar"><i :style="{ width: `${goalPct * 100}%` }" /></i>
        </li>
      </ul>
    </div>
  </HudPanel>
</template>

<style scoped lang="scss">
.tw {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}
.tw__pts {
  font-size: 1.9rem;
  font-weight: 600;
  line-height: 1;
}
.tw__unit {
  font-size: 0.72rem;
  color: var(--hud-text-dim);
}
.tw__rows {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
  li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.88rem;
    color: var(--hud-text-dim);
    svg {
      width: 1.1rem;
      height: 1.1rem;
      color: var(--hud-primary);
    }
    b {
      color: var(--hud-text);
      font-variant-numeric: tabular-nums;
    }
  }
}
.tw__goal .tw__bar {
  grid-column: 1 / -1;
  display: block;
  height: 0.4rem;
  border-radius: 99px;
  background: color-mix(in srgb, var(--hud-border) 50%, transparent);
  overflow: hidden;
  i {
    display: block;
    height: 100%;
    border-radius: 99px;
    background: linear-gradient(90deg, var(--hud-blue), var(--hud-primary));
    box-shadow: 0 0 0.5rem var(--hud-glow);
  }
}
</style>
